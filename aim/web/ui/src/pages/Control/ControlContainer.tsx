import ErrorBoundary from 'components/ErrorBoundary/ErrorBoundary';

import Control from './Control';

const ControlContainer = () => {
  return (
    <ErrorBoundary>
      <Control />
    </ErrorBoundary>
  );
};

export default ControlContainer;
