import React from 'react';

import { Text } from 'components/kit';

import { ProbeIdea } from '../parseCodexResult';

import JsonComparePanel from './JsonComparePanel';
import ProbeIdeaCard from './ProbeIdeaCard';

interface ProbeIdeaGridProps {
  probes: ProbeIdea[];
}

type SelectionState = {
  left: { id: string; probe: ProbeIdea } | null;
  right: { id: string; probe: ProbeIdea } | null;
};

function ProbeIdeaGrid({ probes }: ProbeIdeaGridProps) {
  const [selection, setSelection] = React.useState<SelectionState>({
    left: null,
    right: null,
  });

  const handleCompare = React.useCallback((id: string, probe: ProbeIdea) => {
    setSelection((prev) => {
      if (!prev.left || prev.left.id === id) {
        return {
          left: { id, probe },
          right: prev.right && prev.right.id === id ? null : prev.right,
        };
      }
      if (!prev.right && prev.left.id !== id) {
        return { ...prev, right: { id, probe } };
      }
      if (prev.right && prev.right.id === id) {
        return prev;
      }
      return { ...prev, right: { id, probe } };
    });
  }, []);

  const handleClear = React.useCallback(() => {
    setSelection({ left: null, right: null });
  }, []);

  const handleSwap = React.useCallback(() => {
    setSelection((prev) => {
      if (!prev.left || !prev.right) {
        return prev;
      }
      return { left: prev.right, right: prev.left };
    });
  }, []);

  return (
    <div className='Agent__structuredSection'>
      <Text
        size={12}
        weight={600}
        color='info'
        className='Agent__structuredSection__title'
      >
        Structured: PROBE_IDEA ({probes.length})
      </Text>

      {selection.left && (
        <JsonComparePanel
          kind='PROBE_IDEA'
          leftTitle={selection.left.probe.probe_name || selection.left.id}
          rightTitle={selection.right?.probe.probe_name || selection.right?.id}
          leftObj={selection.left.probe}
          rightObj={selection.right?.probe}
          onClear={handleClear}
          onSwap={handleSwap}
        />
      )}

      <div className='Agent__probeGrid'>
        {probes.map((probe, index) => (
          <ProbeIdeaCard
            key={`probe_${index}`}
            id={`probe_${index}`}
            probe={probe}
            onCompare={handleCompare}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(ProbeIdeaGrid);
