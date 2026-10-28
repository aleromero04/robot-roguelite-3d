import { defineConfig } from 'vite';
export default defineConfig({
    base: '/robot-roguelite-3d/',
    build: {
        rollupOptions: {
            output: { manualChunks: { three: ['three'], postprocessing: ['three/addons/postprocessing/EffectComposer.js', 'three/addons/postprocessing/UnrealBloomPass.js', 'three/addons/postprocessing/OutputPass.js'] } },
        },
    },
});
