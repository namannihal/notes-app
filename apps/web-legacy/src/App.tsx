import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { useAppStore } from './stores/useAppStore';
import { useTheme } from './hooks/useTheme';
import { Tree } from './components/Tree/Tree';
import { NoteList } from './components/NoteList/NoteList';
import { Editor } from './components/Editor/Editor';

export default function App() {
  const { theme, toggle } = useTheme();
  const { selectedNoteId, mobilePane, setMobilePane, treeCollapsed, toggleTree } = useAppStore();

  const note = useLiveQuery(
    () => (selectedNoteId ? db.notes.get(selectedNoteId) : undefined),
    [selectedNoteId],
  );
  const activeNote = note && !note.deletedAt ? note : undefined;

  return (
    <div
      className="app"
      data-mobile-pane={mobilePane}
      data-tree-collapsed={treeCollapsed}
    >
      <Tree />
      <NoteList />

      <div className="pane pane--editor">
        <div className="pane-header">
          <div style={{ display: 'flex', gap: 4 }}>
            {treeCollapsed && (
              <button className="icon-btn" title="Show sidebar" onClick={toggleTree}>
                »
              </button>
            )}
            <button className="icon-btn app-mobile-only" title="Stacks" onClick={() => setMobilePane('tree')}>
              ☰
            </button>
            <button className="icon-btn app-mobile-only" title="Notes" onClick={() => setMobilePane('list')}>
              ≣
            </button>
          </div>
          <button className="icon-btn" title="Toggle theme" onClick={toggle}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>

        {activeNote ? (
          <Editor noteId={activeNote.id} />
        ) : (
          <div className="editor-empty">Select or create a note to start writing.</div>
        )}
      </div>
    </div>
  );
}
