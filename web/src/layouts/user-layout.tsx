import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { WorkbenchModeSwitch } from "@/components/workbench/workbench-mode-switch";

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const inWorkbench = pathname === "/image" || pathname === "/video";
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
                {inWorkbench ? (
                    <div className="workbench-mode-dock pointer-events-none fixed left-1/2 z-40 w-full -translate-x-1/2 px-3 sm:px-4">
                        <div className="mx-auto flex w-full max-w-5xl justify-end px-3 sm:px-8">
                            <div className="pointer-events-auto">
                                <WorkbenchModeSwitch mode={pathname === "/video" ? "video" : "image"} />
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
