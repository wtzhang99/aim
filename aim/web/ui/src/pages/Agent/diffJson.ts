export interface DiffRow {
  path: string;
  left: string;
  right: string;
  same: boolean;
}

export function buildDiffRows(leftObj: any, rightObj: any): DiffRow[] {
  if (!leftObj || !rightObj) {
    return [];
  }

  const left = flattenObject(leftObj);
  const right = flattenObject(rightObj);
  const paths = Array.from(
    new Set([...Object.keys(left), ...Object.keys(right)]),
  ).sort();

  return paths.map((path) => {
    const leftVal = stringifyValue(left[path]);
    const rightVal = stringifyValue(right[path]);
    return {
      path,
      left: leftVal,
      right: rightVal,
      same: leftVal === rightVal,
    };
  });
}

function flattenObject(value: any, basePath = ''): Record<string, any> {
  const result: Record<string, any> = {};

  if (value === null || typeof value !== 'object') {
    result[basePath || 'value'] = value;
    return result;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      result[basePath || 'value'] = [];
      return result;
    }
    value.forEach((item, index) => {
      const path = basePath ? `${basePath}[${index}]` : `[${index}]`;
      Object.assign(result, flattenObject(item, path));
    });
    return result;
  }

  const entries = Object.entries(value);
  if (!entries.length) {
    result[basePath || 'value'] = {};
    return result;
  }

  entries.forEach(([key, val]) => {
    const path = basePath ? `${basePath}.${key}` : key;
    Object.assign(result, flattenObject(val, path));
  });

  return result;
}

function stringifyValue(value: any): string {
  if (value === undefined) {
    return '—';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return truncate(JSON.stringify(value));
  } catch (error) {
    return '[Object]';
  }
}

function truncate(value: string, limit = 200): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}
