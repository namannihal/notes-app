import { create } from 'zustand';

const TREE_KEY = 'sthir-tree-collapsed';
const LIST_KEY = 'sthir-list-collapsed';
const SORT_KEY = 'sthir-note-sort';
const LIST_WIDTH_KEY = 'sthir-list-width';
const FOCUS_KEY = 'sthir-focus';
const TBL_W_KEY = 'sthir-table-border-w';
const TBL_SHADE_KEY = 'sthir-table-border-shade';
const EDITOR_FONT_KEY = 'sthir-editor-font';

const MIN_LIST_WIDTH = 220;
const MAX_LIST_WIDTH = 640;

const DEFAULT_TABLE_BORDER_W = 1.5;
const DEFAULT_TABLE_BORDER_SHADE = 35;

export type NoteSort = 'updated' | 'created' | 'title' | 'manual';
export type EditorFont = 'serif' | 'sans';

interface AppState {
  selectedStackId: string | null;
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  /** Sidebar (stacks/notebooks tree) collapsed on wide screens. */
  treeCollapsed: boolean;
  /** Note-list pane collapsed on wide screens. */
  listCollapsed: boolean;
  /** Focus mode: hide both side panels for a full-width note. */
  focusMode: boolean;
  /** Note-list sort mode. */
  noteSort: NoteSort;
  /** Width (px) of the note-list pane on wide screens. */
  listWidth: number;
  /** Table cell border thickness in px. */
  tableBorderWidth: number;
  /** Table cell border darkness (% of foreground colour mixed in). */
  tableBorderShade: number;
  /** Default typing font for the editor body. */
  editorFont: EditorFont;
  /** When set, the note list shows all notes carrying this tag. */
  tagFilter: string | null;
  /** Mobile/narrow navigation pane. */
  mobilePane: 'tree' | 'list' | 'editor';
  selectStack: (id: string | null) => void;
  selectNotebook: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  setMobilePane: (pane: 'tree' | 'list' | 'editor') => void;
  toggleTree: () => void;
  toggleList: () => void;
  toggleFocus: () => void;
  setNoteSort: (sort: NoteSort) => void;
  setTagFilter: (tag: string | null) => void;
  setListWidth: (w: number) => void;
  setTableBorderWidth: (w: number) => void;
  setTableBorderShade: (s: number) => void;
  setEditorFont: (f: EditorFont) => void;
}

function initialListWidth(): number {
  const s = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(LIST_WIDTH_KEY)) : NaN;
  return Number.isFinite(s) && s >= MIN_LIST_WIDTH && s <= MAX_LIST_WIDTH ? s : 320;
}

function initialSort(): NoteSort {
  const s = typeof localStorage !== 'undefined' ? localStorage.getItem(SORT_KEY) : null;
  return s === 'created' || s === 'title' || s === 'manual' ? s : 'updated';
}

function initialTableBorderWidth(): number {
  const s = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(TBL_W_KEY)) : NaN;
  return Number.isFinite(s) && s >= 0.5 && s <= 5 ? s : DEFAULT_TABLE_BORDER_W;
}

function initialTableBorderShade(): number {
  const s = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(TBL_SHADE_KEY)) : NaN;
  return Number.isFinite(s) && s >= 5 && s <= 90 ? s : DEFAULT_TABLE_BORDER_SHADE;
}

function initialEditorFont(): EditorFont {
  const s = typeof localStorage !== 'undefined' ? localStorage.getItem(EDITOR_FONT_KEY) : null;
  return s === 'sans' ? 'sans' : 'serif';
}

export const useAppStore = create<AppState>((set) => ({
  selectedStackId: null,
  selectedNotebookId: null,
  selectedNoteId: null,
  treeCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem(TREE_KEY) === 'true',
  listCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem(LIST_KEY) === 'true',
  focusMode: typeof localStorage !== 'undefined' && localStorage.getItem(FOCUS_KEY) === 'true',
  noteSort: initialSort(),
  listWidth: initialListWidth(),
  tableBorderWidth: initialTableBorderWidth(),
  tableBorderShade: initialTableBorderShade(),
  editorFont: initialEditorFont(),
  tagFilter: null,
  mobilePane: 'tree',
  selectStack: (id) => set({ selectedStackId: id }),
  selectNotebook: (id) =>
    set({ selectedNotebookId: id, selectedNoteId: null, mobilePane: 'list', tagFilter: null }),
  selectNote: (id) => set({ selectedNoteId: id, mobilePane: 'editor' }),
  setMobilePane: (mobilePane) => set({ mobilePane }),
  toggleTree: () =>
    set((s) => {
      const treeCollapsed = !s.treeCollapsed;
      localStorage.setItem(TREE_KEY, String(treeCollapsed));
      return { treeCollapsed };
    }),
  toggleList: () =>
    set((s) => {
      const listCollapsed = !s.listCollapsed;
      localStorage.setItem(LIST_KEY, String(listCollapsed));
      return { listCollapsed };
    }),
  toggleFocus: () =>
    set((s) => {
      const focusMode = !s.focusMode;
      localStorage.setItem(FOCUS_KEY, String(focusMode));
      return { focusMode };
    }),
  setNoteSort: (noteSort) => {
    localStorage.setItem(SORT_KEY, noteSort);
    set({ noteSort });
  },
  setTagFilter: (tagFilter) => set({ tagFilter, mobilePane: 'list' }),
  setListWidth: (w) => {
    const clamped = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(w)));
    localStorage.setItem(LIST_WIDTH_KEY, String(clamped));
    set({ listWidth: clamped });
  },
  setTableBorderWidth: (w) => {
    const clamped = Math.min(5, Math.max(0.5, w));
    localStorage.setItem(TBL_W_KEY, String(clamped));
    set({ tableBorderWidth: clamped });
  },
  setTableBorderShade: (s) => {
    const clamped = Math.min(90, Math.max(5, Math.round(s)));
    localStorage.setItem(TBL_SHADE_KEY, String(clamped));
    set({ tableBorderShade: clamped });
  },
  setEditorFont: (f) => {
    localStorage.setItem(EDITOR_FONT_KEY, f);
    set({ editorFont: f });
  },
}));
