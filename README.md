# VectorMint

VectorMint is a browser-only bitmap to SVG tracer for logos, icons, stickers, flat illustrations, and line art.

VectorMint 是一个纯浏览器运行的位图转 SVG 工具，适合 logo、图标、贴纸、扁平插画和黑白线稿。


<img width="1090" height="730" alt="image" src="https://github.com/user-attachments/assets/29ae9a24-29aa-4e27-b3ed-533ca6164d89" />



## Features / 功能

- Runs fully in the browser with no upload step.
- 完全在浏览器本地运行，不上传图片。
- Accepts PNG, JPG, and WebP images.
- 支持 PNG、JPG、WebP。
- Generates real SVG paths, not embedded raster images.
- 导出真正的 SVG 路径，不是把位图嵌进 SVG。
- Includes color, logo/icon, and monochrome tracing modes.
- 支持彩色块面、Logo/图标、黑白线稿模式。
- Includes fast, balanced, high, and ultra quality presets.
- 提供快速、标准、高清、超清质量预设。
- Adjustable palette size, detail, path smoothing, curve fitting, and denoise filtering.
- 可调颜色数量、细节、平滑、曲线拟合和去噪。
- Supports SVG download and copy-to-clipboard.
- 支持下载 SVG 和复制 SVG 代码。
- Protects the browser from oversized inputs by rejecting files over 750MB or images over 80 megapixels.
- 内置保护限制：拒绝超过 750MB 或 8000 万像素的图片。

## Use / 使用

Open `index.html` in a browser, load an image, tune the controls, and download the SVG.

在浏览器中打开 `index.html`，导入图片，调整参数，然后下载 SVG。

For GitHub Pages, publish this folder as a static site. No build step is required.

如果部署到 GitHub Pages，直接把这个文件夹作为静态站点发布即可，不需要构建步骤。

## Limits / 限制

VectorMint runs in the browser, so it is not designed for gigabyte-scale images. The app rejects files over 750MB or images over 80 megapixels to avoid freezing the browser. For PNG, JPEG, and WebP files, VectorMint reads the image header first so many large files can be rejected by dimensions before full browser decoding. For very large artwork, resize the bitmap first and then import it.

VectorMint 在浏览器中运行，所以不适合处理 GB 级图片。为了避免浏览器卡死，工具会拒绝超过 750MB 或 8000 万像素的图片。对于 PNG、JPEG、WebP，VectorMint 会先读取图片头尺寸，尽量在完整解码前拦截过大的图片。超大图片建议先缩放再导入。

## Good Fit / 适合

- Logos and marks
- Logo 和标志
- Icons
- 图标
- Simple stickers
- 简单贴纸
- Flat AI-generated illustrations
- 扁平风格 AI 插画
- Black-and-white line art
- 黑白线稿

## Not A Good Fit / 不适合

- Photorealistic images
- 写实照片
- Fine painterly texture
- 复杂绘画纹理
- Complex gradients
- 复杂渐变
- Images that need layered Illustrator-style semantic editing
- 需要 Illustrator 式分层语义编辑的图片

## How It Works / 原理

VectorMint downsamples the image according to the selected quality preset, quantizes colors with a small k-means palette, removes tiny connected components, traces pixel-region boundaries, simplifies closed contours, optionally fits smoother quadratic curves, and emits an SVG with one or more filled paths per color layer.

VectorMint 会按质量预设缩放图片，用小型 k-means 调色板做颜色量化，移除微小连通区域，追踪像素区域边界，简化闭合轮廓，并可选地拟合更平滑的二次曲线，最后按颜色层输出 SVG 填充路径。

## Credit / 署名

made by Marcel330-ait

## License

MIT
