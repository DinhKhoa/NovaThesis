const fs = require('fs');
const path = require('path');

function findRoutes(dir) {
    const results = [];
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...findRoutes(fullPath));
        } else if (fullPath.endsWith('.routes.ts')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(/\.(get|post|put|patch|delete)\(\s*(['"`])(.*?)\2/);
                if (match) {
                    const method = match[1].toUpperCase();
                    const url = match[3];
                    const moduleName = path.basename(fullPath).replace('.routes.ts', '');
                    results.push(`[${moduleName}] ${method} ${url}`);
                }
            }
        }
    }
    return results;
}

const routes = findRoutes('backend/src/modules');
console.log(routes.join('\n'));
