import React from 'react';

import { Text } from 'components/kit';

import { DevDoc } from '../parseCodexResult';

import JsonComparePanel from './JsonComparePanel';
import DevDocCard from './DevDocCard';

interface DevDocGridProps {
  docs: DevDoc[];
}

type DevSelection = {
  left: { id: string; doc: DevDoc } | null;
  right: { id: string; doc: DevDoc } | null;
};

function DevDocGrid({ docs }: DevDocGridProps) {
  const [selection, setSelection] = React.useState<DevSelection>({
    left: null,
    right: null,
  });

  const handleCompare = React.useCallback((id: string, doc: DevDoc) => {
    setSelection((prev) => {
      if (!prev.left || prev.left.id === id) {
        return {
          left: { id, doc },
          right: prev.right && prev.right.id === id ? null : prev.right,
        };
      }
      if (!prev.right && prev.left.id !== id) {
        return { ...prev, right: { id, doc } };
      }
      if (prev.right && prev.right.id === id) {
        return prev;
      }
      return { ...prev, right: { id, doc } };
    });
  }, []);

  const handleClear = React.useCallback(
    () => setSelection({ left: null, right: null }),
    [],
  );

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
        Structured: DEV_DOC ({docs.length})
      </Text>

      {selection.left && (
        <JsonComparePanel
          kind='DEV_DOC'
          leftTitle={selection.left.doc.title || selection.left.id}
          rightTitle={selection.right?.doc.title || selection.right?.id}
          leftObj={selection.left.doc}
          rightObj={selection.right?.doc}
          onClear={handleClear}
          onSwap={handleSwap}
        />
      )}

      <div className='Agent__devDocGrid'>
        {docs.map((doc, index) => {
          const id = doc.doc_id || `doc_${index}`;
          return (
            <DevDocCard key={id} id={id} doc={doc} onCompare={handleCompare} />
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(DevDocGrid);
