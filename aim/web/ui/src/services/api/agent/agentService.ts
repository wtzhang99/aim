import API from '../api';

const endpoints = {
  GET_AGENTS: 'agent',
  INSTRUCT: (runHash: string) => `agent/${runHash}/instruct`,
};

function getAgents() {
  return API.get(endpoints.GET_AGENTS);
}

function instructAgent(runHash: string, body: object) {
  return API.post(endpoints.INSTRUCT(runHash), body, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

const agentService = {
  endpoints,
  getAgents,
  instructAgent,
};

export default agentService;
