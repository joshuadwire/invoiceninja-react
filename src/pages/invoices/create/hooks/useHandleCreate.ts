/**
 * Invoice Ninja (https://invoiceninja.com).
 *
 * @link https://github.com/invoiceninja/invoiceninja source repository
 *
 * @copyright Copyright (c) 2022. Invoice Ninja LLC (https://invoiceninja.com)
 *
 * @license https://www.elastic.co/licensing/elastic-license
 */

import { AxiosError } from 'axios';
import { endpoint } from '$app/common/helpers';
import { request } from '$app/common/helpers/request';
import { route } from '$app/common/helpers/route';
import { toast } from '$app/common/helpers/toast/toast';
import { GenericSingleResourceResponse } from '$app/common/interfaces/generic-api-response';
import { Invoice } from '$app/common/interfaces/invoice';
import { ValidationBag } from '$app/common/interfaces/validation-bag';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { isDeleteActionTriggeredAtom } from '../../common/components/ProductsTable';

export function useHandleCreate(
  setErrors: (errors: ValidationBag | undefined) => unknown
) {
  const navigate = useNavigate();

  const setIsDeleteActionTriggered = useSetAtom(isDeleteActionTriggeredAtom);

  return (invoice: Invoice) => {
    toast.processing();
    setErrors(undefined);

    request('POST', endpoint('/api/v1/invoices'), invoice)
      .then((response: GenericSingleResourceResponse<Invoice>) => {
        toast.success('created_invoice');

        navigate(route('/invoices/:id/edit', { id: response.data.data.id }));
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
