/**
 * Invoice Ninja (https://invoiceninja.com).
 *
 * @link https://github.com/invoiceninja/invoiceninja source repository
 *
 * @copyright Copyright (c) 2022. Invoice Ninja LLC (https://invoiceninja.com)
 *
 * @license https://www.elastic.co/licensing/elastic-license
 */

import axios from 'axios';
import { endpoint } from '$app/common/helpers';
import { Invoice } from '$app/common/interfaces/invoice';
import { useQueryClient } from 'react-query';
import { useDispatch } from 'react-redux';
import { route } from '$app/common/helpers/route';
import { useInjectCompanyChanges } from '$app/common/hooks/useInjectCompanyChanges';
import { updateRecord } from '$app/common/stores/slices/company-users';
import { request } from '$app/common/helpers/request';
import { ValidationBag } from '$app/common/interfaces/validation-bag';
import { toast } from '$app/common/helpers/toast/toast';
import { useSetAtom } from 'jotai';
import { isDeleteActionTriggeredAtom } from '../../common/components/ProductsTable';

export function useHandleSave(
  setErrors: (errors: ValidationBag | undefined) => unknown
) {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const company = useInjectCompanyChanges();

  const setIsDeleteActionTriggered = useSetAtom(isDeleteActionTriggeredAtom);

  return (invoice: Invoice) => {
    setErrors(undefined);
    toast.processing();

    axios
      .all([
        request(
          'PUT',
          endpoint('/api/v1/invoices/:id', { id: invoice.id }),
          invoice
        ),
        request(
          'PUT',
          endpoint('/api/v1/companies/:id', { id: company?.id }),
          company
        ),
      ])
      .then((response) => {
        toast.success('updated_invoice');

        dispatch(
          updateRecord({ object: 'company', data: response[1].data.data })
        );
      })
      .catch((error) => {
        console.error(error);

        error.response?.status === 422
          ? toast.dismiss() && setErrors(error.response.data)
          : toast.error();
      })
      .finally(() => {
        setIsDeleteActionTriggered(undefined);

        queryClient.invalidateQueries(
          route('/api/v1/invoices/:id', { id: invoice.id })
        );
      });
  };
}
