/**
 * TrguiNG - next gen remote GUI for transmission torrent daemon
 * Copyright (C) 2023  qu1ck (mail at qu1ck.org)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { fileSystemSafeName, chainedIterables } from "trutil";
import type { Torrent, TorrentBase, TorrentFile } from "./rpc/torrent";
import type { PriorityNumberType } from "rpc/transmission";

interface Entry {
    name: string,
    level: number,
    fullpath: string,
    parent?: DirEntry,
    size: number,
    done: number,
    percent: number,
    isSelected: boolean,
    wantedUpdating: boolean,
}

export interface FileEntry extends Entry {
    index: number,
    want: boolean,
    priority: PriorityNumberType,
}

export interface DirEntry extends Entry {
    want?: boolean,
    priority?: PriorityNumberType,
    subdirs: Map<string, DirEntry>,
    files: Map<string, FileEntry>,
}

export type FileDirEntry = FileEntry | DirEntry;

export interface FileDirEntryView extends Omit<FileDirEntry, "subdirs" | "files" | "isSelected" | "parent" | "index"> {
    subrows: FileDirEntryView[],
}

export function isDirEntry(entry: FileDirEntry): entry is DirEntry {
    return "files" in entry;
}

export class CachedFileTree {
    tree!: DirEntry;
    torrenthash: string;
    torrentId: number;
    files!: FileEntry[];
    filePathToIndex!: Record<string, number>;
    initialized!: boolean;

    constructor(hash: string, id: number) {
        this.torrenthash = hash;
        this.torrentId = id;
        this._reset();
    }

    _reset() {
        this.tree = {
            name: "",
            level: 0,
            fullpath: "",
            size: 0,
            want: true,
            priority: 0,
            done: 0,
            percent: 0,
            subdirs: new Map(),
            files: new Map(),
            isSelected: false,
            wantedUpdating: false,
        };
        this.files = [];
        this.filePathToIndex = {};
        this.initialized = false;
    }

    findEntry(path: string): FileDirEntry | undefined {
        const parts = path.split("/");
        let node = this.tree;
        if (parts[0] === this.tree.fullpath) parts.shift();
        for (let i = 0; i < parts.length; i++) {
            if (node.subdirs.has(parts[i])) {
                node = node.subdirs.get(parts[i]) as DirEntry;
            } else if (node.files.has(parts[i])) {
                return node.files.get(parts[i]) as FileEntry;
            } else {
                return undefined;
            }
        }
        return node;
    }

    recalcTree(dir: DirEntry) {
        // recurse into the tree to recalculate sizes, percentages, priorities
        dir.subdirs.forEach((d) => { this.recalcTree(d); });

        let size = 0;
        let done = 0;
        const want = new Set<boolean | undefined>();
        const priority = new Set<PriorityNumberType | undefined>();

        const update = (e: FileDirEntry) => {
            size += e.size;
            done += e.done;
            want.add(e.want);
            priority.add(e.priority);
        };

        dir.subdirs.forEach(update);
        dir.files.forEach(update);

        dir.size = size;
        dir.done = done;
        dir.percent = done * 100 / size;
        dir.want = want.size === 1 ? [...want][0] : undefined;
        dir.priority = priority.size === 1 ? [...priority][0] : undefined;
    }

    parse(torrent: TorrentBase, fromFile: boolean) {
        this.torrenthash = torrent.hashString as string;

        this.files = (torrent.files as TorrentFile[]).map((entry: TorrentFile, index: number): FileEntry => {
            const path = (entry.name as string).replace(/\\/g, "/");

            return {
                index,
                name: path.substring(path.lastIndexOf("/") + 1),
                level: 0,
                fullpath: path,
                size: entry.length as number,
                want: fromFile ? true : torrent.fileStats[index].wanted as boolean,
                done: fromFile ? 0 : torrent.fileStats[index].bytesCompleted,
                percent: fromFile ? 0 : torrent.fileStats[index].bytesCompleted * 100 / entry.length,
                priority: fromFile ? 0 : torrent.fileStats[index].priority,
                isSelected: false,
                wantedUpdating: false,
            };
        });

        const safeName = fileSystemSafeName(torrent.name);

        if (this.files.length > 1 ||
            (this.files.length > 0 && this.files[0].fullpath.startsWith(safeName + "/"))) {
            this.tree.fullpath = safeName;
        }

        const filePathIndex: Array<[string, number]> = this.files
            .map((f, i): [string, number] => [f.fullpath, i])
            .sort((a, b) => {
                if (a[0] < b[0]) return -1;
                if (a[0] > b[0]) return 1;
                return 0;
            });

        this.filePathToIndex = {};

        filePathIndex.forEach(([path, index]) => {
            this.filePathToIndex[path] = index;
            const parts = path.split("/");
            let node = this.tree;
            let currentPath = node.fullpath;
            if (parts[0] === currentPath) parts.shift();
            for (let i = 0; i < parts.length - 1; i++) {
                const subdir = parts[i];
                currentPath = currentPath === "" ? subdir : currentPath + "/" + subdir;
                const existingNode = node.subdirs.get(subdir);
                if (existingNode === undefined) {
                    const newNode: DirEntry = {
                        name: subdir,
                        level: i,
                        fullpath: currentPath,
                        size: 0,
                        done: 0,
                        percent: 0,
                        subdirs: new Map(),
                        files: new Map(),
                        parent: node,
                        isSelected: false,
                        wantedUpdating: false,
                    };
                    node.subdirs.set(subdir, newNode);
                    node = newNode;
                } else {
                    node = existingNode;
                }
            }
            node.files.set(parts[parts.length - 1], this.files[index]);
            this.files[index].parent = node;
            this.files[index].level = parts.length - 1;
        });

        this.recalcTree(this.tree);

        if (torrent.files.length > 0) {
            this.initialized = true;
        }
    }

    update(torrent: Torrent) {
        const files = torrent.files as TorrentFile[];
        // update wanted, priority, done and percent fields in the tree
        files.forEach((entry: TorrentFile, index: number) => {
            const path = (entry.name as string).replace(/\\/g, "/");
            if (this.files[index].fullpath !== path) {
                this._reset();
                this.parse(torrent, false);
                return;
            }
            this.files[index].want = torrent.fileStats[index].wanted;
            this.files[index].priority = torrent.fileStats[index].priority;
            this.files[index].done = torrent.fileStats[index].bytesCompleted as number;
            this.files[index].percent = this.files[index].done * 100 / this.files[index].size;
        });
        const clearWantedUpdating = (node: DirEntry) => {
            node.wantedUpdating = false;
            node.files.forEach((f) => { f.wantedUpdating = false; });
            node.subdirs.forEach(clearWantedUpdating);
        };
        clearWantedUpdating(this.tree);

        this.recalcTree(this.tree);
    }

    updatePath(path: string, name: string) {
        const entry = this.findEntry(path);
        if (entry === undefined) return;

        const pathParts = entry.fullpath.split("/");
        pathParts.pop();
        pathParts.push(name);

        const newEntry: FileDirEntry = { ...entry, name, fullpath: pathParts.join("/") };

        if (isDirEntry(entry)) {
            (entry.parent as DirEntry).subdirs.delete(entry.name);
            (entry.parent as DirEntry).subdirs.set(name, newEntry as DirEntry);
        } else {
            (entry.parent as DirEntry).files.delete(entry.name);
            (entry.parent as DirEntry).files.set(name, newEntry as FileEntry);
        }
    }

    setWanted(path: string, state: boolean, updating: boolean) {
        const entry = this.findEntry(path);
        if (entry === undefined) return;

        const recurse = (dir: DirEntry) => {
            dir.subdirs.forEach((d) => {
                recurse(d);
            });
            dir.want = state;
            dir.wantedUpdating = updating;
            dir.files.forEach((f) => {
                f.want = state;
                f.wantedUpdating = updating;
            });
        };

        if (isDirEntry(entry)) {
            recurse(entry);
        } else {
            entry.want = state;
            entry.wantedUpdating = updating;
        }

        this.recalcTree(this.tree);
    }

    getChildFilesIndexes(path: string) {
        const result: number[] = [];
        const entry = this.findEntry(path);
        if (entry === undefined) return result;
        if (!isDirEntry(entry)) return [entry.index];

        const recurse = (dir: DirEntry) => {
            dir.subdirs.forEach((d) => {
                recurse(d);
            });
            dir.files.forEach((f) => {
                result.push(f.index);
            });
        };

        recurse(entry);

        return result;
    }

    getUnwanted() {
        const result: number[] = [];

        const recurse = (dir: DirEntry) => {
            dir.subdirs.forEach((d) => {
                recurse(d);
            });
            dir.files.forEach((f) => {
                if (!f.want) result.push(f.index);
            });
        };

        recurse(this.tree);

        return result;
    }

    getWantedSize() {
        return this.files.reduce((acc, f) => f.want ? acc + f.size : acc, 0);
    }

    setSelection(dir: DirEntry, value: boolean) {
        dir.subdirs.forEach((d) => { this.setSelection(d, value); });
        dir.files.forEach((f) => { f.isSelected = value; });
        dir.isSelected = value;
    }

    deselectAllAncestors(entry: Entry) {
        let parent = entry.parent;
        while (parent != null) {
            parent.isSelected = false;
            parent = parent.parent;
        }
    }

    updateAncestorSelectionStates(ancestor: DirEntry) {
        let dirEntry: DirEntry | undefined = ancestor;
        while (dirEntry != null && dirEntry !== this.tree) {
            dirEntry.isSelected = true;
            for (const child of chainedIterables<Entry>(dirEntry.subdirs.values(), dirEntry.files.values())) {
                if (!child.isSelected) {
                    dirEntry.isSelected = false;
                    this.deselectAllAncestors(dirEntry);
                    return;
                }
            }
            dirEntry = dirEntry.parent;
        }
    }

    selectAction({ verb, ids }: { verb: "add" | "set" | "toggle", ids: string[] }) {
        const affectedParents = new Set<DirEntry>();
        if (verb === "set") {
            this.setSelection(this.tree, false);
        }
        ids.forEach((id) => {
            const entry = this.findEntry(id);
            if (entry === undefined) {
                console.error("What the horse? Unexpected state in cached file tree", id);
                return;
            }
            if (entry.parent != null) affectedParents.add(entry.parent);
            if (verb !== "toggle" || !entry.isSelected) {
                if (isDirEntry(entry)) {
                    this.setSelection(entry, true);
                } else {
                    entry.isSelected = true;
                }
            } else {
                if (isDirEntry(entry)) {
                    this.setSelection(entry, false);
                } else {
                    entry.isSelected = false;
                }
            }
        });
        affectedParents.forEach(parent => { this.updateAncestorSelectionStates(parent); });
    }

    getSelected(): string[] {
        const result: string[] = [];

        const recurse = (dir: DirEntry) => {
            if (dir.isSelected) result.push(dir.fullpath);
            dir.files.forEach((f) => {
                if (f.isSelected) result.push(f.fullpath);
            });
            dir.subdirs.forEach(recurse);
        };

        recurse(this.tree);

        return result;
    }

    getView(flat: boolean): FileDirEntryView[] {
        const result: FileDirEntryView[] = [];
        const getName = (e: FileDirEntry) => {
            if (!flat || e.fullpath === e.name) return e.name;
            return e.fullpath.split("/").slice(1).join("/");
        };
        const copyEntry: (e: FileDirEntry, subrows: FileDirEntryView[]) => FileDirEntryView = (e, subrows) => ({
            name: getName(e),
            level: flat ? 0 : e.level,
            fullpath: e.fullpath,
            size: e.size,
            done: e.done,
            percent: e.percent,
            wantedUpdating: e.wantedUpdating,
            want: e.want,
            priority: e.priority,
            subrows,
        });

        if (flat) {
            const flatten = (e: FileDirEntry) => {
                if (isDirEntry(e)) {
                    for (const subdir of e.subdirs.values()) flatten(subdir);
                    result.push(...Array.from(e.files.values()).map((e) => copyEntry(e, [])));
                } else {
                    result.push(copyEntry(e, []));
                }
            };
            flatten(this.tree);
        } else {
            const toView: (e: FileDirEntry) => FileDirEntryView = (e) => {
                const subrows: FileDirEntryView[] = [];
                if (isDirEntry(e)) {
                    subrows.push(...Array.from(e.subdirs.values()).map(toView));
                    subrows.push(...Array.from(e.files.values()).map(toView));
                }
                return copyEntry(e, subrows);
            };

            result.push(...Array.from(this.tree.subdirs.values()).map(toView));
            result.push(...Array.from(this.tree.files.values()).map(toView));
        }

        return result;
    }
}
