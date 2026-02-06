import React from 'react';
import { useModel } from 'hooks';

import ErrorBoundary from 'components/ErrorBoundary/ErrorBoundary';

import agentAppModel from 'services/models/agent/agentAppModel';

import Agent from './Agent';

const agentsRequestRef = agentAppModel.getAgentsData();

function AgentContainer(): React.FunctionComponentElement<React.ReactNode> {
  const agentData = useModel(agentAppModel);

  React.useEffect(() => {
    agentAppModel.initialize();
    agentsRequestRef.call();
  }, []);

  return (
    <ErrorBoundary>
      <Agent
        agentsList={agentData?.agentsList}
        isAgentsDataLoading={agentData?.isAgentsDataLoading}
        isInstructLoading={agentData?.isInstructLoading}
        instructResult={agentData?.instructResult}
      />
    </ErrorBoundary>
  );
}

export default AgentContainer;
