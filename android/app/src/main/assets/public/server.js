const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PERSONS_DIR = path.join(__dirname, 'saved persons');

// Ensure directory exists
if (!fs.existsSync(PERSONS_DIR)) {
    fs.mkdirSync(PERSONS_DIR);
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
    '.png': 'image/png'
};

const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Endpoint to retrieve all saved faces
    if (req.url === '/api/faces' && req.method === 'GET') {
        fs.readdir(PERSONS_DIR, (err, files) => {
            if (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to read directory' }));
                return;
            }
            
            let jsonFiles = files.filter(f => f.endsWith('.json'));
            if (jsonFiles.length === 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }

            let loadedFaces = [];
            let processed = 0;

            jsonFiles.forEach(file => {
                fs.readFile(path.join(PERSONS_DIR, file), 'utf8', (err, data) => {
                    if (!err) {
                        try {
                            loadedFaces.push(JSON.parse(data));
                        } catch(e) {
                            console.error('Invalid JSON file:', file);
                        }
                    }
                    processed++;
                    if (processed === jsonFiles.length) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(loadedFaces));
                    }
                });
            });
        });
        return;
    }

    // Endpoint to save a face locally
    if (req.url === '/api/save_face' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                // Clean the name to make a safe filename
                const safeName = data.label.replace(/[^a-z0-9]/gi, '_');
                const jsonPath = path.join(PERSONS_DIR, `${safeName}.json`);
                const imgPath = path.join(PERSONS_DIR, `${safeName}.png`);
                
                // Write the Face API descriptor data
                fs.writeFile(jsonPath, JSON.stringify({ label: data.label, descriptor: data.descriptor }, null, 2), (err) => {
                    if (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'Failed to save face descriptor' }));
                        return;
                    }
                    
                    // Write the actual Photo if provided
                    if (data.image) {
                        const base64Data = data.image.replace(/^data:image\/png;base64,/, "");
                        fs.writeFile(imgPath, base64Data, 'base64', (err) => {
                            if (err) console.error("Failed to save image:", err);
                        });
                    }
                    
                    console.log(`Successfully saved face and photo for: ${data.label}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, file: `${safeName}.json` }));
                });
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid payload' }));
            }
        });
        return;
    }

    // Serve Static Files
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if(err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Backend Server Running. App is available at http://localhost:${PORT}/`);
    console.log(`Ready to save faces directly to: ${PERSONS_DIR}`);
});
