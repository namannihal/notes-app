'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Cloud,
  CloudOff,
  KeyRound,
  LogOut,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  PanelLeftOpen,
  PanelRightOpen,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { db } from '@/db/db';
import { gcOrphanAttachments } from '@/db/attachments';
import { useAppStore } from '@/stores/useAppStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { useSync } from '@/sync/useSync';
import { resetSyncCursor } from '@/sync/engine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogProvider } from '@/components/dialog-provider';
import { LoginScreen } from '@/components/login-screen';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { Toaster } from '@/components/toaster';
import { toast } from '@/stores/useToast';
import { Tree } from '@/components/tree';
import { NoteList } from '@/components/note-list';
import { Editor } from '@/components/Editor/Editor';
import { EditorErrorBoundary } from '@/components/error-boundary';

function SyncStatus() {
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const authed = status === 'authed';
  const { state } = useSync(authed);
  const [pwOpen, setPwOpen] = useState(false);
  const prevState = useRef(state);

  useEffect(() => {
    if (state === 'error' && prevState.current !== 'error') {
      toast('Sync failed — retrying. Your notes are saved locally.', 'error');
    }
    prevState.current = state;
  }, [state]);

  if (!authed) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Local only">
        <CloudOff className="size-4" /> Offline
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span
        className="flex items-center text-muted-foreground"
        title={state === 'error' ? 'Sync error — will retry' : 'Synced'}
      >
        {state === 'syncing' ? (
          <RefreshCw className="size-4 animate-spin" />
        ) : state === 'error' ? (
          <CloudOff className="size-4 text-destructive" />
        ) : (
          <Cloud className="size-4" />
        )}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Change password"
        onClick={() => setPwOpen(true)}
      >
        <KeyRound />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Sign out"
        onClick={() => {
          resetSyncCursor();
          void logout();
        }}
      >
        <LogOut />
      </Button>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}

function Shell() {
  const { theme, toggle } = useTheme();
  const {
    selectedNoteId,
    mobilePane,
    setMobilePane,
    treeCollapsed,
    toggleTree,
    listCollapsed,
    toggleList,
    focusMode,
    toggleFocus,
    listWidth,
    setListWidth,
  } = useAppStore();

  function startListResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: PointerEvent) => setListWidth(startW + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  useEffect(() => {
    // Best-effort: keep our IndexedDB data from being evicted.
    void navigator.storage?.persist?.();
    // One-time cleanup of orphaned attachments/blobs left by deleted notes.
    const t = setTimeout(() => void gcOrphanAttachments(), 8000);
    return () => clearTimeout(t);
  }, []);

  const note = useLiveQuery(
    () => (selectedNoteId ? db.notes.get(selectedNoteId) : undefined),
    [selectedNoteId],
  );
  const activeNote = note && !note.deletedAt ? note : undefined;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          'dark h-full w-64 shrink-0 flex-col border-r bg-sidebar text-foreground',
          mobilePane === 'tree' ? 'flex' : 'hidden',
          treeCollapsed || focusMode ? 'md:hidden' : 'md:flex',
        )}
      >
        <Tree />
      </aside>

      <section
        style={{ '--list-w': `${listWidth}px` } as React.CSSProperties}
        className={cn(
          'h-full w-full shrink-0 flex-col border-r md:w-[var(--list-w)]',
          mobilePane === 'list' ? 'flex' : 'hidden',
          listCollapsed || focusMode ? 'md:hidden' : 'md:flex',
        )}
      >
        <NoteList />
      </section>

      {!listCollapsed && !focusMode && (
        <div
          onPointerDown={startListResize}
          title="Drag to resize the notes list"
          className="hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50 md:block"
        />
      )}

      <main
        className={cn(
          'h-full min-w-0 flex-1 flex-col',
          mobilePane === 'editor' ? 'flex' : 'hidden',
          'md:flex',
        )}
      >
        <header className="flex h-12 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              title={focusMode ? 'Exit full width (show panels)' : 'Expand note (hide panels)'}
              onClick={toggleFocus}
            >
              {focusMode ? <Minimize2 /> : <Maximize2 />}
            </Button>
            {treeCollapsed && !focusMode && (
              <Button variant="ghost" size="icon-sm" title="Show sidebar" onClick={toggleTree}>
                <PanelLeftOpen />
              </Button>
            )}
            {listCollapsed && !focusMode && (
              <Button variant="ghost" size="icon-sm" title="Show notes" onClick={toggleList}>
                <PanelRightOpen />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              title="Stacks"
              onClick={() => setMobilePane('tree')}
            >
              <PanelLeft />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <SyncStatus />
            <Button variant="ghost" size="icon-sm" title="Toggle theme" onClick={toggle}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>

        {activeNote ? (
          <EditorErrorBoundary>
            <Editor noteId={activeNote.id} />
          </EditorErrorBoundary>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Select or create a note to start writing.
          </div>
        )}
      </main>
    </div>
  );
}

export function AppShell() {
  const status = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Offline-first: show the app immediately (local data). Only swap to the
  // login screen if the server is reachable and explicitly rejects the session.
  return (
    <DialogProvider>
      {status === 'anon' ? <LoginScreen /> : <Shell />}
      <Toaster />
    </DialogProvider>
  );
}
