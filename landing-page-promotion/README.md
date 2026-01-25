# NullSet Landing Page

This is the standalone marketing/promotional landing page for NullSet. It's completely separate from the main application and can be deployed anywhere.

## Purpose

- **Promote the GitHub repository**
- **Showcase features** (terminal demo, what we scan, installation guide)
- **Drive installations** of the actual app

## Deployment Options

### 1. GitHub Pages (Free)
```bash
# Create a new repo called "nullset-landing"
git init
git add index.html
git commit -m "Initial landing page"
git branch -M main
git remote add origin https://github.com/yourusername/nullset-landing.git
git push -u origin main

# Then enable GitHub Pages in repo settings
# Your page will be live at: https://yourusername.github.io/nullset-landing/
```

### 2. Vercel (Free)
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com)
3. Import the repo
4. Deploy!

### 3. Netlify (Free)
1. Push this folder to a GitHub repo
2. Go to [netlify.com](https://netlify.com)
3. Drag and drop the `index.html` file
4. Done!

### 4. Any Static Host
Simply upload `index.html` to any web server. No build process needed!

## Features

- ✅ Fully self-contained (single HTML file)
- ✅ No build process required
- ✅ Uses CDN for TailwindCSS
- ✅ Responsive design
- ✅ Interactive terminal demo
- ✅ Features showcase
- ✅ Installation guide

## Customization

Update these sections in `index.html`:

1. **GitHub URL**: Search for `https://github.com/nullset/nullset` and replace with your actual repo
2. **Social Links**: Update Twitter/GitHub links in footer
3. **Installation Commands**: Update git clone URL to match your repo

## License

Same as main NullSet project
