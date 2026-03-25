const ejs = require('ejs');
const fs = require('fs');

try {
  const template = fs.readFileSync('views/analytics.ejs', 'utf8');
  const rendered = ejs.render(template, {
    stats: { total_likes: 10, total_views: 20, total_reach: 30 },
    platformStats: [],
    recentPosts: []
  });
  console.log("Rendered successfully!");
} catch(err) {
  console.error("Render error:", err);
}
