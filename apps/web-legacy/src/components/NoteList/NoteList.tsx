import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { createNote, deleteNote } from '../../db/queries';
import { useAppStore } from '../../stores/useAppStore';
import { useDialog } from '../ui/DialogProvider';

export function NoteList() {
  const { selectedNotebookId, selectedNoteId, selectNote } = useAppStore();
  const dialog = useDialog();

  const notebook = useLiveQuery(
    () => (selectedNotebookId ? db.notebooks.get(selectedNotebookId) : undefined),
    [selectedNotebookId],
  );

  const notes = useLiveQuery(async () => {
    if (!selectedNotebookId) return [];
    const rows = await db.notes.where('notebookId').equals(selectedNotebookId).toArray();
    return rows
      .filter((n) => !n.deletedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [selectedNotebookId]);

  async function addNote() {
    if (!selectedNotebookId) return;
    const note = await createNote(selectedNotebookId);
    selectNote(note.id);
  }

  if (!selectedNotebookId) {
    return (
      <div className="pane pane--list">
        <div className="pane-header">
          <h2>Notes</h2>
        </div>
        <div className="list-empty">Select a notebook.</div>
      </div>
    );
  }

  return (
    <div className="pane pane--list">
      <div className="pane-header">
        <h2>{notebook?.title ?? 'Notes'}</h2>
        <button className="icon-btn" title="New note" onClick={addNote}>
          ＋
        </button>
      </div>

      {notes?.length === 0 && <div className="list-empty">No notes yet.</div>}

      {notes?.map((note) => (
        <button
          key={note.id}
          className={`note-item${selectedNoteId === note.id ? ' is-selected' : ''}`}
          onClick={() => selectNote(note.id)}
        >
          <div className="note-item__title">{note.title || 'Untitled'}</div>
          <div className="note-item__preview">
            {note.contentText.slice(0, 80) || 'Empty note'}
          </div>
          <span
            className="icon-btn"
            role="button"
            title="Delete note"
            style={{ float: 'right', minWidth: 32, minHeight: 32 }}
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await dialog.confirm({
                title: 'Delete note',
                message: `Delete "${note.title || 'Untitled'}"?`,
                confirmText: 'Delete',
                danger: true,
              });
              if (ok) await deleteNote(note.id);
            }}
          >
            🗑
          </span>
        </button>
      ))}
    </div>
  );
}
