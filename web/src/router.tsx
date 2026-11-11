import { createBrowserRouter, Outlet } from "react-router-dom";
import { lazy, Suspense, type ComponentType } from "react";

import { RouteLoading } from "@/components/layout/route-loading";
import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";

/**
 * 页面按路由分包：原先七个页面全是静态 import，全部打进同一个 chunk，
 * 首屏要下 2.9MB（gzip 940KB）才看得到首页 —— 而首页本身只用得到
 * lucide 图标和几个动效组件。改成 React.lazy 后每个页面各自成块，
 * 首次进入某页才拉那一块。
 *
 * 注意：`@/layouts/user-layout` 和 `AnalyticsTracker` 保持静态导入，
 * 它们是外壳，任何路由都要用，拆出去只会多一次往返。
 */
const HomePage = lazy(() => import("@/pages/home"));
const ImagePage = lazy(() => import("@/pages/image"));
const VideoPage = lazy(() => import("@/pages/video"));
const AssetsPage = lazy(() => import("@/pages/assets"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ConfigPage = lazy(() => import("@/pages/config"));
const NotFound = lazy(() => import("@/pages/not-found"));

/** 把懒加载页面包进 Suspense，fallback 用统一的路由占位。 */
function withSuspense(Page: ComponentType) {
    return (
        <Suspense fallback={<RouteLoading />}>
            <Page />
        </Suspense>
    );
}

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Suspense fallback={<RouteLoading />}>
                    <Outlet />
                </Suspense>
            </UserLayout>
        ),
        children: [
            { path: "/", element: withSuspense(HomePage) },
            { path: "/image", element: withSuspense(ImagePage) },
            { path: "/video", element: withSuspense(VideoPage) },
            { path: "/assets", element: withSuspense(AssetsPage) },
            { path: "/canvas", element: withSuspense(CanvasPage) },
            { path: "/canvas/:id", element: withSuspense(CanvasProjectPage) },
            { path: "/config", element: withSuspense(ConfigPage) },
        ],
    },
    { path: "*", element: withSuspense(NotFound) },
]);
