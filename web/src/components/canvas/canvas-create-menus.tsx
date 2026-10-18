import { useEffect, useRef, useState } from "react";
import { Brush, ChevronRight, ImageIcon, List, Music2, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { getNodeSpec } from "@/constant/canvas";
import { CanvasNodeType, type ConnectionHandle, type Position } from "@/types/canvas";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

export function ConnectionCreateMenu({
    pending,
    scale = 1,
    onCreate,
    onClose,
}: {
    pending: PendingConnectionCreate;
    scale?: number;
    onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Video | CanvasNodeType.Audio | "transfer") => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    const [showMore, setShowMore] = useState(false);
    return (
        <div
            className="canvas-node-menu sketch-menu canvas-command-menu atelier-connection-create absolute z-[120] w-[240px] rounded-[18px] border p-2 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: pending.position.x, top: pending.position.y, transform: `scale(${1 / scale})`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {/* Inner wrapper animates without overriding the counter-scale above. */}
            <div className="canvas-create-menu-pop-in sketch-menu-inner">
            <div className="sketch-menu-inner grid gap-0.5">
                <ConnectionCreateOption theme={theme} icon={<List className="size-4" />} title={t("canvas.createMenu.text")} onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-4" />} title={t("canvas.createMenu.image")} onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-4" />} title={t("canvas.createMenu.video")} onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-4" />} title={t("canvas.createMenu.audio")} onClick={() => onCreate(CanvasNodeType.Audio)} />
                {showMore ? <ConnectionCreateOption theme={theme} icon={<Brush className="size-4" />} title={t("canvas.createMenu.transfer")} onClick={() => onCreate("transfer")} /> : null}
                <button
                    type="button"
                    className="sketch-menu-item sketch-menu-item--node atelier-show-more flex h-12 w-full items-center gap-2.5 rounded-xl px-2 text-left transition"
                    data-menu-item
                    style={{ color: theme.node.text }}
                    onClick={() => setShowMore((current) => !current)}
                >
                    <span className="sketch-menu-item-icon-box grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: theme.node.fill, color: theme.node.muted }}>
                        <ChevronRight className={`size-4 transition-transform ${showMore ? "rotate-90" : ""}`} />
                    </span>
                    <span className="sketch-menu-item-label text-sm font-medium leading-5">{showMore ? "收起更多选项" : "显示更多选项"}</span>
                </button>
            </div>
            </div>
        </div>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="sketch-menu-item sketch-menu-item--node flex h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left transition"
            data-menu-item
            style={{ color: theme.node.text }}
            onClick={onClick}
        >
            <span className="sketch-menu-item-icon-box grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="sketch-menu-item-label min-w-0 flex-1 truncate text-sm font-medium leading-5">{title}</span>
        </button>
    );
}

export function NodeCreateMenu({ position, scale = 1, onCreate, onClose }: { position: Position; scale?: number; onCreate: (type: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useNodeRegistryVersion();
    const menuRef = useRef<HTMLDivElement>(null);
    const definitions = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false);
    // Close automatically when clicking outside the menu.
    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [onClose]);
    return (
        <div
            ref={menuRef}
            className="canvas-node-menu sketch-menu canvas-command-menu atelier-node-create-menu absolute z-[120] max-h-[70vh] w-[240px] overflow-y-auto rounded-[18px] border p-2 shadow-2xl backdrop-blur thin-scrollbar"
            data-canvas-no-zoom
            style={{ left: position.x, top: position.y, transform: `scale(${1 / scale})`, transformOrigin: "top left", background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {/* Inner wrapper animates without overriding the counter-scale above. */}
            <div className="canvas-create-menu-pop-in sketch-menu-inner">
            <div className="atelier-node-create-header mb-1.5 flex items-center px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {t("canvas.createMenu.select")}
                </span>
            </div>
            <div className="sketch-menu-inner grid gap-0.5">
                {definitions.map((def) => (
                    <ConnectionCreateOption key={def.type} theme={theme} icon={def.icon} title={getNodeSpec(def.type).title} description={def.description} onClick={() => onCreate(def.type)} />
                ))}
            </div>
            </div>
        </div>
    );
}
