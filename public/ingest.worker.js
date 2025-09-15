/* public/ingest.worker.js */
self.onmessage = async (e) => {
    const { file, batchSize = 50000 } = e.data;

    const reader = file.stream().getReader();
    const td = new TextDecoder();
    let buf = "";
    let batch = [];

    const postBatch = () => {
        if (batch.length) {
            self.postMessage({ type: "batch", rows: batch });
            batch = [];
        }
    };

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += td.decode(value, { stream: true });

            let lastNL = buf.lastIndexOf("\n");
            if (lastNL < 0) continue;

            const chunk = buf.slice(0, lastNL);
            buf = buf.slice(lastNL + 1);

            const lines = chunk.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const ln = lines[i].trim();
                if (!ln) continue;
                try {
                    const r = JSON.parse(ln);
                    // keep only what your UI needs
                    batch.push({
                        x: r.x, y: r.y,
                        metadata: r.metadata || null,
                        features: r.features || null,
                        cluster_labels: r.cluster_labels || null,
                    });
                    if (batch.length >= batchSize) postBatch();
                } catch (err) {
                    self.postMessage({ type: "error", error: String(err).slice(0, 200) });
                }
            }
        }

        if (buf.trim()) {
            try {
                const r = JSON.parse(buf.trim());
                batch.push({
                    x: r.x, y: r.y,
                    metadata: r.metadata || null,
                    features: r.features || null,
                    cluster_labels: r.cluster_labels || null,
                });
            } catch { }
        }

        postBatch();
        self.postMessage({ type: "done" });
    } catch (err) {
        self.postMessage({ type: "error", error: String(err).slice(0, 200) });
        self.postMessage({ type: "done" });
    }
};
