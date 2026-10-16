import { createContext, useCallback, useContext, useId, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type PopoverGroupState = {
    activeId: string | null;
    setActiveId: Dispatch<SetStateAction<string | null>>;
};

const PopoverGroupContext = createContext<PopoverGroupState | null>(null);

export function nextPopoverId(activeId: string | null, id: string, open: boolean) {
    // A delayed close from the previous popup must not close the new one.
    return open ? id : activeId === id ? null : activeId;
}

export function PopoverGroup({ children }: { children: ReactNode }) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const value = useMemo(() => ({ activeId, setActiveId }), [activeId]);
    return <PopoverGroupContext.Provider value={value}>{children}</PopoverGroupContext.Provider>;
}

/** Popups share one open ID inside a group; other callers keep independent state. */
export function useExclusivePopover(): [boolean, (open: boolean) => void] {
    const group = useContext(PopoverGroupContext);
    const id = useId();
    const [localOpen, setLocalOpen] = useState(false);
    const setActiveId = group?.setActiveId;
    const setOpen = useCallback(
        (open: boolean) => {
            if (setActiveId) setActiveId((current) => nextPopoverId(current, id, open));
            else setLocalOpen(open);
        },
        [id, setActiveId],
    );

    return [group ? group.activeId === id : localOpen, setOpen];
}

export function useCloseExclusivePopoverGroup() {
    const group = useContext(PopoverGroupContext);
    return useCallback(() => group?.setActiveId(null), [group]);
}
