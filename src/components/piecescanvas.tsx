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

import type { CSSProperties } from "react";
import React, { useEffect, useMemo, useRef } from "react";
import { useResizeDetector } from "react-resize-detector";
import type { Torrent } from "../rpc/torrent";

const toDevicePixels = (cssPixels: number) => cssPixels * window.devicePixelRatio;

export function PiecesCanvas(props: { torrent: Torrent }) {
    const { width: cssWidth, height: cssHeight, ref } = useResizeDetector({
        refreshMode: "throttle",
        refreshRate: 1000,
    });

    const piecesRef = useRef<HTMLCanvasElement>(null);
    const gridRef = useRef<HTMLCanvasElement>(null);

    const wantedPieces = useMemo(() => {
        const result = new Array<boolean>(props.torrent.pieceCount);

        const pieceSize = props.torrent.pieceSize;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lengths = props.torrent.files.map((f: any) => f.length);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wanted = props.torrent.fileStats.map((f: any) => f.wanted);

        let fileIndex = 0;
        let pieceIndex = 0;
        let totalLength = 0;

        while (totalLength < props.torrent.totalSize) {
            totalLength += lengths[fileIndex] as number;
            while ((pieceIndex + 1) * pieceSize < totalLength) {
                result[pieceIndex] = result[pieceIndex] || wanted[fileIndex];
                pieceIndex++;
            }
            result[pieceIndex] = result[pieceIndex] || wanted[fileIndex];
            if ((pieceIndex + 1) * pieceSize === totalLength) pieceIndex++;
            fileIndex++;
        }

        return result;
    }, [props.torrent]);

    const [pieceSize, rows, cols] = useMemo(() => {
        if (cssWidth === undefined || cssHeight === undefined) return [5, 1, 1];

        const canvasWidth = Math.floor(toDevicePixels(cssWidth));
        const canvasHeight = Math.floor(toDevicePixels(cssHeight));
        const pieceCount = props.torrent.pieceCount;
        const maxPieceSize = toDevicePixels(20);
        const minColumns = Math.ceil(canvasWidth / maxPieceSize);

        if (pieceCount < minColumns && canvasHeight >= maxPieceSize) return [maxPieceSize, 1, pieceCount];

        /**
         * The following code is based on https://math.stackexchange.com/a/2570649
         */

        const ratio = canvasWidth / canvasHeight;
        let cols = Math.max(
            Math.ceil(Math.sqrt(pieceCount * ratio)),
            minColumns,
        );
        let rows = Math.ceil(pieceCount / cols);

        while (cols < rows * ratio) {
            cols++;
            rows = Math.ceil(pieceCount / cols);
        }

        return [canvasWidth / cols, rows, cols];
    }, [props.torrent.pieceCount, cssWidth, cssHeight]);

    const pieces = useMemo(() => {
        const bstr = window.atob(props.torrent.pieces);
        const bytes = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) {
            bytes[i] = bstr.charCodeAt(i);
        }
        return bytes;
    }, [props]);

    useEffect(() => {
        const canvas = gridRef.current as HTMLCanvasElement;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const remainder = rows * cols - props.torrent.pieceCount;

        ctx.beginPath();
        ctx.lineWidth = toDevicePixels(pieceSize > toDevicePixels(5) ? 1 : 0.5);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        for (let i = 0; i < rows; i++) {
            ctx.moveTo(0, i * pieceSize);
            ctx.lineTo(cols * pieceSize, i * pieceSize);
        }
        ctx.moveTo(0, rows * pieceSize);
        ctx.lineTo((cols - remainder) * pieceSize, rows * pieceSize);
        for (let i = 0; i <= cols - remainder; i++) {
            ctx.moveTo(i * pieceSize, 0);
            ctx.lineTo(i * pieceSize, rows * pieceSize);
        }
        for (let i = cols - remainder + 1; i <= cols; i++) {
            ctx.moveTo(i * pieceSize, 0);
            ctx.lineTo(i * pieceSize, (rows - 1) * pieceSize);
        }
        ctx.stroke();
    }, [gridRef, rows, cols, cssWidth, cssHeight, props.torrent.pieceCount, pieceSize]);

    useEffect(() => {
        const canvas = piecesRef.current as HTMLCanvasElement;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < rows; r++) {
            let index = 0;
            for (let c = 0; c < cols; c++) {
                index = r * cols + c;
                if (index >= props.torrent.pieceCount) break;
                const have = pieces[Math.floor(index / 8)] & (0b10000000 >> (index % 8));
                ctx.fillStyle = have > 0
                    ? "steelblue"
                    : wantedPieces[index]
                        ? "paleturquoise"
                        : "silver";
                ctx.fillRect(c * pieceSize, r * pieceSize, pieceSize, pieceSize);
            }
            if (index >= props.torrent.pieceCount) break;
        }
    }, [piecesRef, rows, cols, cssWidth, cssHeight, pieceSize, pieces, wantedPieces, props.torrent.pieceCount]);

    const canvasWidth = Math.floor(toDevicePixels(cssWidth ?? 1));
    const canvasHeight = Math.floor(toDevicePixels(cssHeight ?? 1));
    const style: CSSProperties = {
        width: cssWidth ?? 1, height: cssHeight ?? 1, position: "absolute", top: 0, left: 0,
    };
    return (
        <div ref={ref} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
            <canvas ref={piecesRef} width={canvasWidth} height={canvasHeight} style={style} />
            <canvas ref={gridRef} width={canvasWidth} height={canvasHeight} style={style} />
        </div>
    );
}
