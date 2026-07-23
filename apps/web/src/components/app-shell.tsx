'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Cloud,
  CloudOff,
  KeyRound,
  LogOut,
  Moon,
  PanelLeft,
  PanelLeftOpen,
  PanelRightOpen,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { db } from '@/db/db';
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
  } = useAppStore();

  useEffect(() => {
    // Best-effort: keep our IndexedDB data from being evicted.
    void navigator.storage?.persist?.();
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
          treeCollapsed ? 'md:hidden' : 'md:flex',
        )}
      >
        <Tree />
      </aside>

      <section
        className={cn(
          'h-full w-full shrink-0 flex-col border-r md:w-80',
          mobilePane === 'list' ? 'flex' : 'hidden',
          listCollapsed ? 'md:hidden' : 'md:flex',
        )}
      >
        <NoteList />
      </section>

      <main
        className={cn(
          'h-full min-w-0 flex-1 flex-col',
          mobilePane === 'editor' ? 'flex' : 'hidden',
          'md:flex',
        )}
      >
        <header className="flex h-12 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1">
            {treeCollapsed && (
              <Button variant="ghost" size="icon-sm" title="Show sidebar" onClick={toggleTree}>
                <PanelLeftOpen />
              </Button>
            )}
            {listCollapsed && (
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
    <DialogProvider>{status === 'anon' ? <LoginScreen /> : <Shell />}</DialogProvider>
  );
}
