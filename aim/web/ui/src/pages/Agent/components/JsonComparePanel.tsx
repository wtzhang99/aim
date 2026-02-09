import React from 'react';

import { Button, Text } from 'components/kit';

import { DiffRow, buildDiffRows } from '../diffJson';

interface JsonComparePanelProps {
  kind: 'PROBE_IDEA' | 'DEV_DOC';
  leftTitle: string;
  rightTitle?: string;
  leftObj: any;
  rightObj?: any;
  onClear: () => void;
  onSwap: () => void;
}

function JsonComparePanel({
  kind,
  leftTitle,
  rightTitle,
  leftObj,
  rightObj,
  onClear,
  onSwap,
}: JsonComparePanelProps) {
  const [showOnlyDiff, setShowOnlyDiff] = React.useState(true);
  const rows = React.useMemo<DiffRow[]>(
    () => buildDiffRows(leftObj, rightObj),
    [leftObj, rightObj],
  );
  const visibleRows = React.useMemo(
    () => (showOnlyDiff ? rows.filter((row) => !row.same) : rows),
    [rows, showOnlyDiff],
  );

  return (
    <div className='Agent__comparePanel'>
      <div className='Agent__comparePanel__header'>
        <div>
          <Text size={12} weight={600}>
            {kind} comparison
          </Text>
          <Text size={11} color='info'>
            Left: {leftTitle || '(not selected)'}
          </Text>
          <Text size={11} color='info'>
            Right: {rightTitle || '(not selected)'}
          </Text>
        </div>
        <div className='Agent__comparePanel__actions'>
          <Button
            variant='outlined'
            size='small'
            onClick={onSwap}
            disabled={!rightObj}
          >
            Swap
          </Button>
          <Button variant='text' size='small' onClick={onClear}>
            Clear
          </Button>
          <label className='Agent__comparePanel__toggle'>
            <input
              type='checkbox'
              checked={showOnlyDiff}
              onChange={(e) => setShowOnlyDiff(e.target.checked)}
            />
            <span>Show only differences</span>
          </label>
        </div>
      </div>

      {!rightObj ? (
        <Text size={12} color='primary' className='Agent__comparePanel__helper'>
          Select a second item to compare.
        </Text>
      ) : (
        <div className='Agent__comparePanel__tableWrapper'>
          <table className='Agent__comparePanel__table'>
            <thead>
              <tr>
                <th>Field</th>
                <th>Left</th>
                <th>Right</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.path}
                  className={
                    !row.same ? 'Agent__comparePanel__diffRow' : undefined
                  }
                >
                  <td>{row.path}</td>
                  <td>{row.left}</td>
                  <td>{row.right}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <Text size={12} color='info'>
                      No differences found.
                    </Text>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default React.memo(JsonComparePanel);
