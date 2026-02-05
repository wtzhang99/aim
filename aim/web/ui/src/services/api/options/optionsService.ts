import { IApiRequest } from 'types/services/services';

import API from '../api';

interface IOptionsResponse {
  path: string;
  data: unknown;
}

function getOptionsFile(path: string): IApiRequest<IOptionsResponse> {
  return API.get<IOptionsResponse>('options', { path });
}

const optionsService = {
  getOptionsFile,
};

export type { IOptionsResponse };
export default optionsService;
