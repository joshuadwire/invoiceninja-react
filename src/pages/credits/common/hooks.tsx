/**
 * Invoice Ninja (https://invoiceninja.com).
 *
 * @link https://github.com/invoiceninja/invoiceninja source repository
 *
 * @copyright Copyright (c) 2022. Invoice Ninja LLC (https://invoiceninja.com)
 *
 * @license https://www.elastic.co/licensing/elastic-license
 */

import axios, { AxiosError } from 'axios';
import { blankLineItem } from '$app/common/constants/blank-line-item';
import { CreditStatus } from '$app/common/enums/credit-status';
import { date, endpoint, getEntityState } from '$app/common/helpers';
import { InvoiceSum } from '$app/common/helpers/invoices/invoice-sum';
import { request } from '$app/common/helpers/request';
import { route } from '$app/common/helpers/route';
import { toast } from '$app/common/helpers/toast/toast';
import { useCurrentCompany } from '$app/common/hooks/useCurrentCompany';
import { useCurrentUser } from '$app/common/hooks/useCurrentUser';
import { useInjectCompanyChanges } from '$app/common/hooks/useInjectCompanyChanges';
import { useResolveCurrency } from '$app/common/hooks/useResolveCurrency';
import { Client } from '$app/common/interfaces/client';
import { Credit } from '$app/common/interfaces/credit';
import { GenericSingleResourceResponse } from '$app/common/interfaces/generic-api-response';
import {
  InvoiceItem,
  InvoiceItemType,
} from '$app/common/interfaces/invoice-item';
import {
  Invitation,
  PurchaseOrder,
} from '$app/common/interfaces/purchase-order';
import { Quote } from '$app/common/interfaces/quote';
import { RecurringInvoice } from '$app/common/interfaces/recurring-invoice';
import { ValidationBag } from '$app/common/interfaces/validation-bag';
import { updateRecord } from '$app/common/stores/slices/company-users';
import { Divider } from '$app/components/cards/Divider';
import { DropdownElement } from '$app/components/dropdown/DropdownElement';
import { Action } from '$app/components/ResourceActions';
import { useAtom, useSetAtom } from 'jotai';
import { invoiceAtom } from '$app/pages/invoices/common/atoms';
import { openClientPortal } from '$app/pages/invoices/common/helpers/open-client-portal';
import { useDownloadPdf } from '$app/pages/invoices/common/hooks/useDownloadPdf';
import {
  DataTableColumnsExtended,
  resourceViewedAt,
} from '$app/pages/invoices/common/hooks/useInvoiceColumns';
import { purchaseOrderAtom } from '$app/pages/purchase-orders/common/atoms';
import { quoteAtom } from '$app/pages/quotes/common/atoms';
import { recurringInvoiceAtom } from '$app/pages/recurring-invoices/common/atoms';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from 'react-query';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { creditAtom, invoiceSumAtom } from './atoms';
import { useBulkAction } from './hooks/useBulkAction';
import { useMarkSent } from './hooks/useMarkSent';
import { CreditStatus as CreditStatusBadge } from '../common/components/CreditStatus';
import { Link } from '$app/components/forms';
import { useFormatMoney } from '$app/common/hooks/money/useFormatMoney';
import { useCurrentCompanyDateFormats } from '$app/common/hooks/useCurrentCompanyDateFormats';
import { useResolveCountry } from '$app/common/hooks/useResolveCountry';
import { CopyToClipboard } from '$app/components/CopyToClipboard';
import { EntityStatus } from '$app/components/EntityStatus';
import { Icon } from '$app/components/icons/Icon';
import {
  MdArchive,
  MdCloudCircle,
  MdControlPointDuplicate,
  MdCreditCard,
  MdCreditScore,
  MdDelete,
  MdDownload,
  MdMarkEmailRead,
  MdPictureAsPdf,
  MdPrint,
  MdRestore,
  MdSchedule,
} from 'react-icons/md';
import { Tooltip } from '$app/components/Tooltip';
import { useEntityCustomFields } from '$app/common/hooks/useEntityCustomFields';
import { useScheduleEmailRecord } from '$app/pages/invoices/common/hooks/useScheduleEmailRecord';
import { usePrintPdf } from '$app/pages/invoices/common/hooks/usePrintPdf';
import { EntityState } from '$app/common/enums/entity-state';
import { isDeleteActionTriggeredAtom } from '$app/pages/invoices/common/components/ProductsTable';

interface CreditUtilitiesProps {
  client?: Client;
}

export type ChangeHandler = <T extends keyof Credit>(
  property: T,
  value: Credit[typeof property]
) => void;

export function useCreditUtilities(props: CreditUtilitiesProps) {
  const currencyResolver = useResolveCurrency();
  const company = useCurrentCompany();

  const [credit, setCredit] = useAtom(creditAtom);
  const [, setInvoiceSum] = useAtom(invoiceSumAtom);

  const handleChange: ChangeHandler = (property, value) => {
    setCredit((current) => current && { ...current, [property]: value });
  };

  const handleInvitationChange = (id: string, checked: boolean) => {
    let invitations = [...credit!.invitations];

    const potential =
      invitations?.find((invitation) => invitation.client_contact_id === id) ||
      -1;

    if (potential !== -1 && checked === false) {
      invitations = invitations.filter((i) => i.client_contact_id !== id);
    }

    if (potential === -1) {
      const invitation: Partial<Invitation> = {
        client_contact_id: id,
      };

      invitations.push(invitation as Invitation);
    }

    handleChange('invitations', invitations);
  };

  const handleLineItemChange = (index: number, lineItem: InvoiceItem) => {
    const lineItems = credit?.line_items || [];

    lineItems[index] = lineItem;

    setCredit((current) => current && { ...current, line_items: lineItems });
  };

  const handleLineItemPropertyChange = (
    key: keyof InvoiceItem,
    value: unknown,
    index: number
  ) => {
    const lineItems = credit?.line_items || [];

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    lineItems[index][key] = value;

    setCredit((current) => current && { ...current, line_items: lineItems });
  };

  const handleCreateLineItem = () => {
    setCredit(
      (current) =>
        current && {
          ...current,
          line_items: [
            ...current.line_items,
            { ...blankLineItem(), type_id: InvoiceItemType.Product },
          ],
        }
    );
  };

  const handleDeleteLineItem = (index: number) => {
    const lineItems = credit?.line_items || [];

    lineItems.splice(index, 1);

    setCredit((current) => current && { ...current, line_items: lineItems });
  };

  const calculateInvoiceSum = (credit: Credit) => {
    const currency = currencyResolver(
      props.client?.settings.currency_id || company?.settings.currency_id
    );

    if (currency && credit) {
      const invoiceSum = new InvoiceSum(credit, currency).build();

      setInvoiceSum(invoiceSum);
    }
  };

  return {
    handleChange,
    handleInvitationChange,
    handleLineItemChange,
    handleLineItemPropertyChange,
    handleCreateLineItem,
    handleDeleteLineItem,
    calculateInvoiceSum,
  };
}

interface CreateProps {
  setErrors: (validationBag?: ValidationBag) => unknown;
}

export function useCreate(props: CreateProps) {
  const { setErrors } = props;

  const navigate = useNavigate();

  const setIsDeleteActionTriggered = useSetAtom(isDeleteActionTriggeredAtom);

  return (credit: Credit) => {
    toast.processing();
    setErrors(undefined);

    request('POST', endpoint('/api/v1/credits'), credit)
      .then((response: GenericSingleResourceResponse<Credit>) => {
        toast.success('created_credit');

        navigate(route('/credits/:id/edit', { id: response.data.data.id }));
      })
      .catch((error: AxiosError<ValidationBag>) => {
        console.error(error);

        error.response?.status === 422
          ? toast.dismiss() && setErrors(error.response.data)
          : toast.error();
      })
      .finally(() => setIsDeleteActionTriggered(undefined));
  };
}

export function useSave(props: CreateProps) {
  const { setErrors } = props;

  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const company = useInjectCompanyChanges();

  const setIsDeleteActionTriggered = useSetAtom(isDeleteActionTriggeredAtom);

  return (credit: Credit) => {
    toast.processing();
    setErrors(undefined);

    axios
      .all([
        request(
          'PUT',
          endpoint('/api/v1/credits/:id', { id: credit.id }),
          credit
        ),
        request(
          'PUT',
          endpoint('/api/v1/companies/:id', { id: company?.id }),
          company
        ),
      ])
      .then((response) => {
        toast.success('updated_credit');

        dispatch(
          updateRecord({ object: 'company', data: response[1].data.data })
        );

        queryClient.invalidateQueries(
          route('/api/v1/credits/:id', { id: credit.id })
        );
      })
      .catch((error: AxiosError<ValidationBag>) => {
        console.error(error);

        error.response?.status === 422
          ? toast.dismiss() && setErrors(error.response.data)
          : toast.error();
      })
      .finally(() => setIsDeleteActionTriggered(undefined));
  };
}

export function useActions() {
  const [, setCredit] = useAtom(creditAtom);
  const [, setInvoice] = useAtom(invoiceAtom);
  const [, setQuote] = useAtom(quoteAtom);
  const [, setRecurringInvoice] = useAtom(recurringInvoiceAtom);
  const [, setPurchaseOrder] = useAtom(purchaseOrderAtom);

  const { t } = useTranslation();

  const navigate = useNavigate();
  const location = useLocation();

  const downloadPdf = useDownloadPdf({ resource: 'credit' });
  const printPdf = usePrintPdf({ entity: 'credit' });
  const markSent = useMarkSent();
  const bulk = useBulkAction();
  const scheduleEmailRecord = useScheduleEmailRecord({ entity: 'credit' });

  const cloneToCredit = (credit: Credit) => {
    setCredit({ ...credit, number: '', documents: [] });

    navigate('/credits/create?action=clone');
  };

  const cloneToInvoice = (credit: Credit) => {
    setInvoice({ ...credit, number: '', documents: [], due_date: '' });

    navigate('/invoices/create?action=clone');
  };

  const cloneToQuote = (credit: Credit) => {
    setQuote({ ...(credit as Quote), number: '', documents: [] });

    navigate('/quotes/create?action=clone');
  };

  const cloneToRecurringInvoice = (credit: Credit) => {
    setRecurringInvoice({
      ...(credit as unknown as RecurringInvoice),
      number: '',
      documents: [],
    });

    navigate('/recurring_invoices/create?action=clone');
  };

  const cloneToPurchaseOrder = (credit: Credit) => {
    setPurchaseOrder({
      ...(credit as unknown as PurchaseOrder),
      number: '',
      documents: [],
    });

    navigate('/purchase_orders/create?action=clone');
  };

  const actions: Action<Credit>[] = [
    (credit) => (
      <DropdownElement
        to={route('/credits/:id/pdf', { id: credit.id })}
        icon={<Icon element={MdPictureAsPdf} />}
      >
        {t('view_pdf')}
      </DropdownElement>
    ),
    (credit) =>
      getEntityState(credit) !== EntityState.Deleted && (
        <DropdownElement
          onClick={() => printPdf([credit.id])}
          icon={<Icon element={MdPrint} />}
        >
          {t('print_pdf')}
        </DropdownElement>
      ),
    (credit) => (
      <DropdownElement
        onClick={() => downloadPdf(credit)}
        icon={<Icon element={MdDownload} />}
      >
        {t('download_pdf')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        onClick={() => scheduleEmailRecord(credit.id)}
        icon={<Icon element={MdSchedule} />}
      >
        {t('schedule')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        to={route('/credits/:id/email', { id: credit.id })}
        icon={<Icon element={MdCreditCard} />}
      >
        {t('email_credit')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        onClick={() => credit && openClientPortal(credit)}
        icon={<Icon element={MdCloudCircle} />}
      >
        {t('client_portal')}
      </DropdownElement>
    ),
    (credit) =>
      credit.client_id &&
      credit.amount > 0 && (
        <DropdownElement
          to={route(
            '/payments/create?client=:clientId&credit=:creditId&type=1',
            { clientId: credit.client_id, creditId: credit.id }
          )}
          icon={<Icon element={MdCreditScore} />}
        >
          {t('apply_credit')}
        </DropdownElement>
      ),
    (credit) =>
      credit.status_id === CreditStatus.Draft && (
        <div>
          <DropdownElement
            onClick={() => markSent(credit)}
            icon={<Icon element={MdMarkEmailRead} />}
          >
            {t('mark_sent')}
          </DropdownElement>
        </div>
      ),
    () => <Divider withoutPadding />,
    (credit) => (
      <DropdownElement
        onClick={() => cloneToCredit(credit)}
        icon={<Icon element={MdControlPointDuplicate} />}
      >
        {t('clone')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        onClick={() => cloneToInvoice(credit)}
        icon={<Icon element={MdControlPointDuplicate} />}
      >
        {t('clone_to_invoice')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        onClick={() => cloneToQuote(credit)}
        icon={<Icon element={MdControlPointDuplicate} />}
      >
        {t('clone_to_quote')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        onClick={() => cloneToRecurringInvoice(credit)}
        icon={<Icon element={MdControlPointDuplicate} />}
      >
        {t('clone_to_recurring_invoice')}
      </DropdownElement>
    ),
    (credit) => (
      <DropdownElement
        onClick={() => cloneToPurchaseOrder(credit)}
        icon={<Icon element={MdControlPointDuplicate} />}
      >
        {t('clone_to_purchase_order')}
      </DropdownElement>
    ),
    () => location.pathname.endsWith('/edit') && <Divider withoutPadding />,
    (credit) =>
      location.pathname.endsWith('/edit') &&
      credit.archived_at === 0 && (
        <DropdownElement
          onClick={() => bulk(credit.id, 'archive')}
          icon={<Icon element={MdArchive} />}
        >
          {t('archive')}
        </DropdownElement>
      ),
    (credit) =>
      location.pathname.endsWith('/edit') &&
      credit.archived_at > 0 && (
        <DropdownElement
          onClick={() => bulk(credit.id, 'restore')}
          icon={<Icon element={MdRestore} />}
        >
          {t('restore')}
        </DropdownElement>
      ),
    (credit) =>
      location.pathname.endsWith('/edit') &&
      !credit?.is_deleted && (
        <DropdownElement
          onClick={() => bulk(credit.id, 'delete')}
          icon={<Icon element={MdDelete} />}
        >
          {t('delete')}
        </DropdownElement>
      ),
  ];

  return actions;
}

export const defaultColumns: string[] = [
  'status',
  'number',
  'client',
  'amount',
  'date',
  'remaining',
];

export function useAllCreditColumns() {
  const [firstCustom, secondCustom, thirdCustom, fourthCustom] =
    useEntityCustomFields({
      entity: 'credit',
    });

  const creditColumns = [
    'status',
    'number',
    'client',
    'amount',
    'date',
    'remaining',
    'archived_at',
    // 'assigned_to', @Todo: Need to resolve relationship
    'client_city',
    'client_country',
    'client_postal_code',
    'client_state',
    'contact_email',
    'contact_name',
    'created_at',
    // 'created_by', @Todo: Need to resolve relationship
    firstCustom,
    secondCustom,
    thirdCustom,
    fourthCustom,
    'discount',
    'documents',
    'entity_state',
    'exchange_rate',
    'is_deleted',
    'is_viewed',
    'last_sent_date',
    'partial',
    'partial_due_date',
    'po_number',
    'private_notes',
    // 'project', @Todo: Need to fetch the relationship
    'public_notes',
    'tax_amount',
    'updated_at',
    'valid_until',
    // 'vendor', @Todo: Need to fetch the relationship
  ] as const;

  return creditColumns;
}

export function useCreditColumns() {
  const { t } = useTranslation();
  const { dateFormat } = useCurrentCompanyDateFormats();

  const creditColumns = useAllCreditColumns();
  type CreditColumns = (typeof creditColumns)[number];

  const currentUser = useCurrentUser();
  const company = useCurrentCompany();
  const formatMoney = useFormatMoney();
  const resolveCountry = useResolveCountry();

  const [firstCustom, secondCustom, thirdCustom, fourthCustom] =
    useEntityCustomFields({
      entity: 'credit',
    });

  const columns: DataTableColumnsExtended<Credit, CreditColumns> = [
    {
      column: 'status',
      id: 'status_id',
      label: t('status'),
      format: (_value, credit) => <CreditStatusBadge entity={credit} />,
    },
    {
      column: 'number',
      id: 'number',
      label: t('number'),
      format: (field, credit) => (
        <Link to={route('/credits/:id/edit', { id: credit.id })}>{field}</Link>
      ),
    },
    {
      column: 'client',
      id: 'client_id',
      label: t('client'),
      format: (_, credit) => (
        <Link to={route('/clients/:id', { id: credit.client_id })}>
          {credit.client?.display_name}
        </Link>
      ),
    },
    {
      column: 'amount',
      id: 'amount',
      label: t('amount'),
      format: (value, credit) =>
        formatMoney(
          value,
          credit.client?.country_id || company.settings.country_id,
          credit.client?.settings.currency_id || company.settings.currency_id
        ),
    },
    {
      column: 'date',
      id: 'date',
      label: t('date'),
      format: (value) => date(value, dateFormat),
    },
    {
      column: 'remaining',
      id: 'balance',
      label: t('remaining'),
      format: (_, credit) => {
        return formatMoney(
          credit.balance,
          credit.client?.country_id || company.settings.country_id,
          credit.client?.settings.currency_id || company.settings.currency_id
        );
      },
    },
    {
      column: 'archived_at',
      id: 'archived_at',
      label: t('archived_at'),
      format: (value) => date(value, dateFormat),
    },
    {
      column: 'client_city',
      id: 'client_id',
      label: t('client_city'),
      format: (value, credit) => credit.client?.city,
    },
    {
      column: 'client_country',
      id: 'client_id',
      label: t('client_country'),
      format: (value, credit) =>
        credit.client?.country_id &&
        resolveCountry(credit.client?.country_id)?.name,
    },
    {
      column: 'client_postal_code',
      id: 'client_id',
      label: t('client_postal_code'),
      format: (value, credit) => credit.client?.postal_code,
    },
    {
      column: 'client_state',
      id: 'client_id',
      label: t('client_state'),
      format: (value, credit) => credit.client?.state,
    },
    {
      column: 'contact_email',
      id: 'client_id',
      label: t('contact_email'),
      format: (value, credit) =>
        credit.client &&
        credit.client.contacts.length > 0 && (
          <CopyToClipboard text={credit.client?.contacts[0].email} />
        ),
    },
    {
      column: 'contact_name',
      id: 'client_id',
      label: t('contact_name'),
      format: (value, credit) =>
        credit.client &&
        credit.client.contacts.length > 0 &&
        `${credit.client?.contacts[0].first_name} ${credit.client?.contacts[0].last_name}`,
    },
    {
      column: 'created_at',
      id: 'created_at',
      label: t('created_at'),
      format: (value) => date(value, dateFormat),
    },
    {
      column: firstCustom,
      id: 'custom_value1',
      label: firstCustom,
    },
    {
      column: secondCustom,
      id: 'custom_value2',
      label: secondCustom,
    },
    {
      column: thirdCustom,
      id: 'custom_value3',
      label: thirdCustom,
    },
    {
      column: fourthCustom,
      id: 'custom_value4',
      label: fourthCustom,
    },
    {
      column: 'discount',
      id: 'discount',
      label: t('discount'),
      format: (value, credit) =>
        formatMoney(
          value,
          credit.client?.country_id || company?.settings.country_id,
          credit.client?.settings.currency_id || company?.settings.currency_id
        ),
    },
    {
      column: 'documents',
      id: 'documents',
      label: t('documents'),
      format: (value, credit) => credit.documents.length,
    },
    {
      column: 'entity_state',
      id: 'id',
      label: t('entity_state'),
      format: (value, credit) => <EntityStatus entity={credit} />,
    },
    {
      column: 'exchange_rate',
      id: 'exchange_rate',
      label: t('exchange_rate'),
    },
    {
      column: 'is_deleted',
      id: 'is_deleted',
      label: t('is_deleted'),
      format: (value, credit) => (credit.is_deleted ? t('yes') : t('no')),
    },
    {
      column: 'is_viewed',
      id: 'id',
      label: t('is_viewed'),
      format: (value, credit) =>
        resourceViewedAt(credit).length > 0
          ? date(resourceViewedAt(credit), dateFormat)
          : t('no'),
    },
    {
      column: 'last_sent_date',
      id: 'last_sent_date',
      label: t('last_sent_date'),
      format: (value) => date(value, dateFormat),
    },
    {
      column: 'partial',
      id: 'partial',
      label: t('partial'),
      format: (value, credit) =>
        formatMoney(
          value,
          credit.client?.country_id || company?.settings.country_id,
          credit.client?.settings.currency_id || company?.settings.currency_id
        ),
    },
    {
      column: 'partial_due_date',
      id: 'partial_due_date',
      label: t('partial_due_date'),
      format: (value) => date(value, dateFormat),
    },
    {
      column: 'po_number',
      id: 'po_number',
      label: t('po_number'),
    },
    {
      column: 'private_notes',
      id: 'private_notes',
      label: t('private_notes'),
      format: (value) => (
        <Tooltip size="regular" truncate message={value as string}>
          <span>{value}</span>
        </Tooltip>
      ),
    },
    {
      column: 'public_notes',
      id: 'public_notes',
      label: t('public_notes'),
      format: (value) => (
        <Tooltip size="regular" truncate message={value as string}>
          <span>{value}</span>
        </Tooltip>
      ),
    },
    {
      column: 'tax_amount',
      id: 'total_taxes',
      label: t('total_taxes'),
      format: (value, credit) =>
        formatMoney(
          value,
          credit.client?.country_id || company?.settings.country_id,
          credit.client?.settings.currency_id || company?.settings.currency_id
        ),
    },
    {
      column: 'updated_at',
      id: 'updated_at',
      label: t('updated_at'),
      format: (value) => date(value, dateFormat),
    },
    {
      column: 'valid_until',
      id: 'id',
      label: t('valid_until'),
      format: (value, credit) => date(credit.due_date, dateFormat),
    },
  ];

  const list: string[] =
    currentUser?.company_user?.settings?.react_table_columns?.credit ||
    defaultColumns;

  return columns
    .filter((column) => list.includes(column.column))
    .sort((a, b) => list.indexOf(a.column) - list.indexOf(b.column));
}
