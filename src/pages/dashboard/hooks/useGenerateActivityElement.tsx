/**
 * Invoice Ninja (https://invoiceninja.com).
 *
 * @link https://github.com/invoiceninja/invoiceninja source repository
 *
 * @copyright Copyright (c) 2022. Invoice Ninja LLC (https://invoiceninja.com)
 *
 * @license https://www.elastic.co/licensing/elastic-license
 */

import { date, trans } from '$app/common/helpers';
import { useCurrentCompanyDateFormats } from '$app/common/hooks/useCurrentCompanyDateFormats';
import { ActivityRecord } from '$app/common/interfaces/activity-record';
import { route } from '$app/common/helpers/route';
import reactStringReplace from 'react-string-replace';
import { Link } from '$app/components/forms';
import { useTranslation } from 'react-i18next';
import { useFormatMoney } from '$app/common/hooks/money/useFormatMoney';
import { useCurrentCompany } from '$app/common/hooks/useCurrentCompany';

export function useGenerateActivityElement() {
  const { dateFormat } = useCurrentCompanyDateFormats();
  const { t } = useTranslation();

  const formatMoney = useFormatMoney();
  const company = useCurrentCompany();

  const contact = (activity: ActivityRecord) => {
    if (!activity.client) {
      return t('client');
    }

    // First use primary contact, if possible.
    const primary = activity.client.contacts.find(
      (contact) => contact.is_primary
    );

    if (primary) {
      return `${primary.first_name} ${primary.last_name}`;
    }

    // If we don't have a primary, let's just use first contact.
    const first = activity.client.contacts[0];

    if (first) {
      return `${first.first_name} ${first.last_name}`;
    }

    // As a fallback, use client name.
    return activity.client.display_name;
  };

  const generate = (activity: ActivityRecord) => {
    let text = trans(`activity_${activity.activity_type_id}`, {});

    const replacements = {
      client: (
        <Link to={route('/clients/:id', { id: activity.client?.hashed_id })}>
          {activity.client?.display_name}
        </Link>
      ),
      contact: (
        <Link to={route('/clients/:id', { id: activity.client?.hashed_id })}>
          {contact(activity)}
        </Link>
      ),
      quote: (
        <Link to={route('/quotes/:id/edit', { id: activity.quote?.hashed_id })}>
          {activity.quote?.number}
        </Link>
      ),
      user: activity?.user
        ? `${activity?.user?.first_name} ${activity?.user?.last_name}`
        : 'System',
      expense: (
        <Link
          to={route('/expenses/:id/edit', { id: activity.expense?.hashed_id })}
        >
          {activity?.expense?.number}
        </Link>
      ),
      recurring_invoice: (
        <Link
          to={route('/recurring_invoices/:id/edit', {
            id: activity.recurring_invoice?.hashed_id,
          })}
        >
          {activity?.recurring_invoice?.number}
        </Link>
      ),
      recurring_expense: (
        <Link
          to={route('/recurring_expenses/:id/edit', {
            id: activity.recurring_expense?.hashed_id,
          })}
        >
          {activity?.recurring_expense?.number}
        </Link>
      ),
      purchase_order: (
        <Link
          to={route('/purchase_orders/:id/edit', {
            id: activity.purchase_order?.hashed_id,
          })}
        >
          {activity?.purchase_order?.number}
        </Link>
      ),
      invoice: (
        <Link
          to={route('/invoices/:id/edit', { id: activity.invoice?.hashed_id })}
        >
          {activity?.invoice?.number}
        </Link>
      ),
      payment_amount:
        activity.payment &&
        formatMoney(
          activity.payment.amount,
          activity.client?.country_id || company?.settings.country_id,
          activity.client?.settings.currency_id || company?.settings.currency_id
        ),
      payment: (
        <Link to={route('/payments/:id', { id: activity.payment?.hashed_id })}>
          {activity?.payment?.number}
        </Link>
      ),
      credit: (
        <Link
          to={route('/credits/:id/edit', { id: activity.credit?.hashed_id })}
        >
          {activity?.credit?.number}
        </Link>
      ),
      task: (
        <Link to={route('/tasks/:id/edit', { id: activity.credit?.hashed_id })}>
          {activity?.task?.number}
        </Link>
      ),
      vendor: (
        <Link to={route('/vendors/:id', { id: activity.vendor?.hashed_id })}>
          {activity?.vendor?.name}
        </Link>
      ),
      subscription: (
        <Link
          to={route('/settings/subscriptions/:id/edit', {
            id: activity.subscription?.hashed_id,
          })}
        >
          {activity?.subscription?.name}
        </Link>
      ),
      adjustment:
        activity.payment &&
        formatMoney(
          activity.payment.refunded,
          activity.client?.country_id || company?.settings.country_id,
          activity.client?.settings.currency_id || company?.settings.currency_id
        ),
    };

    for (const [variable, value] of Object.entries(replacements)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      text = reactStringReplace(text, `:${variable}`, () => value);
    }

    return text;
  };

  return (activity: ActivityRecord) => (
    <div className="flex flex-col py-2 border border-b-gray-200 border-t-0 border-x-0 last:border-b-0 hover:bg-gray-50">
      <div className="flex flex-col">
        <span className="text-sm">{generate(activity)}</span>

        <div className="flex space-x-3">
          <span className="dark:text-white text-sm">
            {date(activity.created_at, dateFormat)}
          </span>

          <span className="text-gray-500 text-sm">{activity.ip}</span>
        </div>
      </div>
    </div>
  );
}
