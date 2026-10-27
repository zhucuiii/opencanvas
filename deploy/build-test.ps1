# 10087 开发实例构建脚本。
# 用法：在仓库根目录执行  deploy\build-test.cmd
#
# 产物直接写进 web/.dist-10087，该目录在叠加 deploy/docker-compose.dev.yml 后
# 被 opencanvas-test 容器只读挂载为站点根目录，所以构建完成后刷新
# http://127.0.0.1:10087 就能看到最新代码，不需要重建镜像、不需要重启容器。
#
# 首次使用前先启动一次开发实例（之后改代码都不用再碰它）：
#   docker compose -f docker-compose.yml -f deploy/docker-compose.dev.yml up -d app-test

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$web = Join-Path $root "web"
$outDir = ".dist-10087"

if (-not (Test-Path (Join-Path $web "node_modules"))) {
    throw "web/node_modules 不存在，请先在 web 目录安装依赖。"
}

Push-Location $web
try {
    # 输出目录与 Docker 正式构建的 dist 分开，互不覆盖。
    & node "node_modules\vite\bin\vite.js" build --outDir $outDir --base "/"
    if ($LASTEXITCODE -ne 0) { throw "vite build 失败，退出码 $LASTEXITCODE" }

    $index = Join-Path $web "$outDir\index.html"
    if (-not (Test-Path $index)) { throw "构建产物缺失：$index" }

    $entry = (Select-String -Path $index -Pattern 'assets/(index-[A-Za-z0-9_-]+\.js)' | Select-Object -First 1).Matches[0].Groups[1].Value
    Write-Host ""
    Write-Host "构建完成 -> web/$outDir" -ForegroundColor Green
    Write-Host "入口脚本   $entry"
    Write-Host "测试实例   http://127.0.0.1:10087" -ForegroundColor Cyan
}
finally {
    Pop-Location
}
