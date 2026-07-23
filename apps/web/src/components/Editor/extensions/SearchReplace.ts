import { Extension, type CommandProps } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface SearchResult {
  from: number;
  to: number;
}

interface SearchStorage {
  term: string;
  results: SearchResult[];
  index: number;
  caseSensitive: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setCaseSensitive: (value: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

const searchKey = new PluginKey('searchReplace');

function findMatches(doc: PMNode, term: string, caseSensitive: boolean): SearchResult[] {
  const results: SearchResult[] = [];
  if (!term) return results;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const haystack = caseSensitive ? node.text : node.text.toLowerCase();
      let idx = haystack.indexOf(needle);
      while (idx !== -1) {
        results.push({ from: pos + idx, to: pos + idx + term.length });
        idx = haystack.indexOf(needle, idx + needle.length);
      }
    }
  });
  return results;
}

export const SearchReplace = Extension.create<unknown, SearchStorage>({
  name: 'searchReplace',

  addStorage() {
    return { term: '', results: [], index: 0, caseSensitive: false };
  },

  addCommands() {
    const bump = ({ tr, dispatch }: CommandProps) => {
      if (dispatch) dispatch(tr.setMeta(searchKey, true));
      return true;
    };

    const selectCurrent = ({ editor, tr, dispatch }: CommandProps) => {
      const { results, index } = this.storage;
      const match = results[index];
      if (!match || !dispatch) return true;
      const selection = TextSelection.create(tr.doc, match.from, match.to);
      dispatch(tr.setSelection(selection).scrollIntoView());
      editor.view.focus();
      return true;
    };

    return {
      setSearchTerm:
        (term) =>
        (props) => {
          this.storage.term = term;
          this.storage.index = 0;
          return bump(props);
        },
      setCaseSensitive:
        (value) =>
        (props) => {
          this.storage.caseSensitive = value;
          this.storage.index = 0;
          return bump(props);
        },
      findNext: () => (props) => {
        const { results } = this.storage;
        if (results.length === 0) return true;
        this.storage.index = (this.storage.index + 1) % results.length;
        bump(props);
        return selectCurrent(props);
      },
      findPrev: () => (props) => {
        const { results } = this.storage;
        if (results.length === 0) return true;
        this.storage.index = (this.storage.index + results.length - 1) % results.length;
        bump(props);
        return selectCurrent(props);
      },
      replaceCurrent:
        (replacement) =>
        (props) => {
          const { results, index } = this.storage;
          const match = results[index];
          if (!match) return true;
          const { tr, dispatch } = props;
          if (dispatch) dispatch(tr.insertText(replacement, match.from, match.to));
          return bump(props);
        },
      replaceAll:
        (replacement) =>
        (props) => {
          const { results } = this.storage;
          if (results.length === 0) return true;
          const { tr, dispatch } = props;
          // Replace from last to first so earlier positions stay valid.
          for (let i = results.length - 1; i >= 0; i--) {
            tr.insertText(replacement, results[i].from, results[i].to);
          }
          if (dispatch) dispatch(tr);
          this.storage.index = 0;
          return bump(props);
        },
      clearSearch: () => (props) => {
        this.storage.term = '';
        this.storage.results = [];
        this.storage.index = 0;
        return bump(props);
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            if (!tr.docChanged && !tr.getMeta(searchKey)) return old.map(tr.mapping, tr.doc);
            const results = findMatches(tr.doc, storage.term, storage.caseSensitive);
            storage.results = results;
            if (storage.index >= results.length) storage.index = 0;
            const decorations = results.map((r, i) =>
              Decoration.inline(r.from, r.to, {
                class: i === storage.index ? 'search-current' : 'search-match',
              }),
            );
            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
