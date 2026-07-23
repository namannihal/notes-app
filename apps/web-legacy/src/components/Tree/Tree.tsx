import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  createNotebook,
  createStack,
  deleteNotebook,
  deleteStack,
  renameNotebook,
  renameStack,
} from '../../db/queries';
import { useAppStore } from '../../stores/useAppStore';
import { useDialog } from '../ui/DialogProvider';

const COLLAPSED_KEY = 'sthir-collapsed-stacks';

export function Tree() {
  const { selectedNotebookId, selectNotebook, toggleTree } = useAppStore();
  const dialog = useDialog();

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')),
  );

  function toggleStack(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const stacks = useLiveQuery(
    async () => (await db.stacks.orderBy('position').toArray()).filter((s) => !s.deletedAt),
    [],
  );
  const notebooks = useLiveQuery(
    async () => (await db.notebooks.orderBy('position').toArray()).filter((n) => !n.deletedAt),
    [],
  );

  async function addStack() {
    const title = await dialog.prompt({
      title: 'New stack',
      label: 'Name',
      placeholder: 'e.g. GS Paper 2',
      confirmText: 'Create',
    });
    if (title) await createStack(title);
  }

  async function addNotebook(stackId: string) {
    const title = await dialog.prompt({
      title: 'New notebook',
      label: 'Name',
      placeholder: 'e.g. Polity',
      confirmText: 'Create',
    });
    if (title) await createNotebook(stackId, title);
  }

  async function editStack(id: string, current: string) {
    const title = await dialog.prompt({
      title: 'Rename stack',
      label: 'Name',
      defaultValue: current,
    });
    if (title) await renameStack(id, title);
  }

  async function editNotebook(id: string, current: string) {
    const title = await dialog.prompt({
      title: 'Rename notebook',
      label: 'Name',
      defaultValue: current,
    });
    if (title) await renameNotebook(id, title);
  }

  async function removeStack(id: string, title: string) {
    const ok = await dialog.confirm({
      title: 'Delete stack',
      message: `Delete "${title}" and all its notebooks and notes?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (ok) await deleteStack(id);
  }

  async function removeNotebook(id: string, title: string) {
    const ok = await dialog.confirm({
      title: 'Delete notebook',
      message: `Delete "${title}" and all its notes?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (ok) await deleteNotebook(id);
  }

  return (
    <div className="pane pane--tree">
      <div className="pane-header">
        <h2>Stacks</h2>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="New stack" onClick={addStack}>
            ＋
          </button>
          <button className="icon-btn" title="Collapse sidebar" onClick={toggleTree}>
            «
          </button>
        </div>
      </div>

      {stacks?.length === 0 && <div className="tree-empty">No stacks yet. Create one to begin.</div>}

      {stacks?.map((stack) => (
        <div key={stack.id} className="tree-stack">
          <div className="tree-row">
            <button
              className="tree-caret"
              title={collapsed.has(stack.id) ? 'Expand' : 'Collapse'}
              onClick={() => toggleStack(stack.id)}
            >
              {collapsed.has(stack.id) ? '▸' : '▾'}
            </button>
            <span style={{ flex: 1 }} onDoubleClick={() => editStack(stack.id, stack.title)}>
              📚 {stack.title}
            </span>
            <button className="icon-btn" title="New notebook" onClick={() => addNotebook(stack.id)}>
              ＋
            </button>
            <button className="icon-btn" title="Delete stack" onClick={() => removeStack(stack.id, stack.title)}>
              🗑
            </button>
          </div>

          {!collapsed.has(stack.id) &&
            notebooks
              ?.filter((nb) => nb.stackId === stack.id)
              .map((nb) => (
                <button
                  key={nb.id}
                  className={`tree-row tree-notebook${
                    selectedNotebookId === nb.id ? ' is-selected' : ''
                  }`}
                  onClick={() => selectNotebook(nb.id)}
                  onDoubleClick={() => editNotebook(nb.id, nb.title)}
                >
                  <span style={{ flex: 1 }}>📓 {nb.title}</span>
                  <span
                    className="icon-btn"
                    title="Delete notebook"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeNotebook(nb.id, nb.title);
                    }}
                  >
                    🗑
                  </span>
                </button>
              ))}
        </div>
      ))}
    </div>
  );
}
