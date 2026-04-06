const fs = require('fs');
let c = fs.readFileSync('apps/web/components/chat-experience.tsx', 'utf8');

c = c.replace(/runAIAction,/g, '');
c = c.replace(/import\s*\{\s*buildRelationshipMemory,\s*rewriteWithGhostMode,\s*summarizeConversation,\s*\}\s*from\s*"@\/lib\/local-ai";/g, '');
c = c.replace(/\{\s*id:\s*"ai",\s*label:\s*"AI",\s*caption:\s*"Rewrite, workspace pulse, and dock tools"\s*\},/g, '');
c = c.replace(/function AIIcon\(\)\s*\{\s*return\s*\(\s*<svg[\s\S]*?<\/svg>\s*\);\s*\}/g, '');
c = c.replace(/if\s*\(tab === "ai"\)\s*return <AIIcon \/>;/g, '');
c = c.replace(/const localSummary = useMemo\(\s*\(\)\s*=>\s*summarizeConversation\([\s\S]*?\),\s*\[[\s\S]*?\],\s*\);/g, '');
c = c.replace(/const relationshipMemory = useMemo\(\s*\(\)\s*=>\s*buildRelationshipMemory\([\s\S]*?\),\s*\[[\s\S]*?\],\s*\);/g, '');
c = c.replace(/const ghostRewrite = useMemo\(\(\) => rewriteWithGhostMode\(deferredDraft\), \[deferredDraft\]\);/g, '');
c = c.replace(/<AIIcon \/>/g, 'null');

fs.writeFileSync('apps/web/components/chat-experience.tsx', c);
