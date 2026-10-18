import type { ReactNode } from "react";
import { FileText, Image as ImageIcon, Music2, Plus, Puzzle, Video, X } from "lucide-react";
import { Popover } from "antd";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { getGroupResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function CanvasNodeReferenceBar({
    nodeId,
    nodes,
    connectedNodes,
    onDisconnect,
    onStartSelection,
    headerAddButton = false,
    headerTrailing,
    compact = false,
}: {
    nodeId: string;
    nodes: CanvasNodeData[];
    connectedNodes: CanvasNodeData[];
    onDisconnect?: (fromNodeId: string, toNodeId: string) => void;
    onStartSelection?: (nodeId: string) => void;
    /** 标题行左侧的「＋参考」按钮取代「参考内容」文字，加号不再占缩略图行的一格。 */
    headerAddButton?: boolean;
    /** 标题行右侧的附加内容（如放大编辑按钮）。 */
    headerTrailing?: ReactNode;
    compact?: boolean;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const references = connectedNodes.flatMap((sourceNode) => (sourceNode.type === CanvasNodeType.Group ? getGroupResourceNodes(sourceNode.id, nodes) : [sourceNode]).map((node) => ({ node, sourceNodeId: sourceNode.id })));
    const showReferenceRow = references.length > 0 || !headerAddButton;
    return (
        <div className="mb-2">
            {!compact ? (
                <div className="mb-1.5 flex min-h-7 items-center justify-between gap-2">
                    {headerAddButton ? (
                        <button
                            type="button"
                            className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border bg-transparent px-2 text-[11px] transition hover:opacity-70"
                            style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}
                            title={t("canvas.references.select")}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => onStartSelection?.(nodeId)}
                        >
                            <Plus className="size-3.5" />
                            {t("canvas.references.add")}
                        </button>
                    ) : (
                        <div className="text-[11px] font-medium" style={{ color: theme.node.muted }}>
                            {t("canvas.references.title")}
                        </div>
                    )}
                    {headerTrailing}
                </div>
            ) : null}
            {showReferenceRow ? (
                <div className="thin-scrollbar flex min-h-12 gap-2 overflow-x-auto pb-1">
                    {references.map(({ node, sourceNodeId }) => (
                        <ReferenceItem key={`${sourceNodeId}:${node.id}`} node={node} onRemove={() => onDisconnect?.(sourceNodeId, nodeId)} />
                    ))}
                    {headerAddButton ? null : (
                        <button
                            type="button"
                            className="grid size-12 shrink-0 place-items-center rounded-xl border bg-transparent transition hover:opacity-70"
                            style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}
                            title={t("canvas.references.select")}
                            onClick={() => onStartSelection?.(nodeId)}
                        >
                            <Plus className="size-4" />
                        </button>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function ReferenceItem({ node, onRemove }: { node: CanvasNodeData; onRemove: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    const content = node.metadata?.content || resource?.url;
    const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
    const Icon =
        resource?.kind === "image" || node.type === CanvasNodeType.Image
            ? ImageIcon
            : resource?.kind === "video" || node.type === CanvasNodeType.Video
              ? Video
              : resource?.kind === "audio" || node.type === CanvasNodeType.Audio
                ? Music2
                : resource?.kind === "text" || node.type === CanvasNodeType.Text
                  ? FileText
                  : Puzzle;
    return (
        <Popover placement="topLeft" mouseEnterDelay={0.15} content={<ReferencePreview node={node} content={content} />}>
            <div className="group relative grid size-12 shrink-0 place-items-center rounded-xl border" style={{ background: theme.toolbar.activeBg, borderColor: theme.toolbar.border }}>
                <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">
                    {(resource?.kind === "image" || node.type === CanvasNodeType.Image) && thumbnail ? (
                        <img src={thumbnail} alt="" className="size-full object-cover" />
                    ) : (resource?.kind === "video" || node.type === CanvasNodeType.Video) && content ? (
                        <video src={content} className="size-full object-cover" muted />
                    ) : (
                        <Icon className="size-4 opacity-65" />
                    )}
                </span>
                <button
                    type="button"
                    className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
                    aria-label={t("canvas.references.disconnect")}
                    title={t("canvas.references.disconnect")}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                    }}
                >
                    <X className="size-3" />
                </button>
            </div>
        </Popover>
    );
}

function ReferencePreview({ node, content }: { node: CanvasNodeData; content?: string }) {
    const { t } = useTranslation();
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    if ((resource?.kind === "image" || node.type === CanvasNodeType.Image) && content) return <img src={content} alt={node.title} className="max-h-52 w-72 rounded-lg object-contain" />;
    if ((resource?.kind === "video" || node.type === CanvasNodeType.Video) && content) return <video src={content} className="max-h-52 w-72 rounded-lg" muted controls />;
    if ((resource?.kind === "audio" || node.type === CanvasNodeType.Audio) && content) return <audio src={content} className="w-72" controls />;
    return <div className="max-h-52 w-72 overflow-auto whitespace-pre-wrap text-sm">{resource?.text || node.metadata?.content || node.metadata?.prompt || node.title || t("canvas.references.empty")}</div>;
}
