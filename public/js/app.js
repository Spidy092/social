document.addEventListener('DOMContentLoaded', () => {
    // Multi-file preview
    const mediaInput = document.getElementById('media-input');
    if (mediaInput) {
        mediaInput.addEventListener('change', function() {
            const preview = document.getElementById('file-preview');
            const prompt = document.getElementById('upload-prompt');
            if (!preview || !prompt) return;

            preview.innerHTML = '';
            if (this.files.length > 0) {
                preview.classList.remove('hidden');
                prompt.innerHTML = `<p class="text-xs font-medium text-slate-700">${this.files.length} file(s) selected</p>`;

                Array.from(this.files).slice(0, 10).forEach(file => {
                    const div = document.createElement('div');
                    div.className = 'aspect-square rounded-lg overflow-hidden bg-slate-100 border';
                    if (file.type.startsWith('image/')) {
                        const img = document.createElement('img');
                        img.src = URL.createObjectURL(file);
                        img.className = 'w-full h-full object-cover';
                        div.appendChild(img);
                    } else {
                        div.innerHTML = '<div class="w-full h-full flex items-center justify-center text-slate-400"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 15l5.197-3L10 9v6z"/></svg></div>';
                    }
                    preview.appendChild(div);
                });
            } else {
                preview.classList.add('hidden');
            }
        });
    }

    // Platform Caption Toggles
    document.querySelectorAll('.platform-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const platform = e.target.getAttribute('data-platform');
            const box = document.getElementById(`caption-box-${platform}`);
            if (box) box.classList.toggle('hidden', !e.target.checked);
        });
    });

    // AI Caption Button
    const aiBtn = document.getElementById('ai-caption-btn');
    if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
            const caption = document.querySelector('textarea[name="caption"]').value;
            const selectedPlatforms = Array.from(document.querySelectorAll('.platform-toggle:checked')).map(el => el.value);

            if (!caption) return alert('Please enter a base caption first.');
            if (selectedPlatforms.length === 0) return alert('Select at least one platform.');

            const originalText = aiBtn.innerHTML;
            aiBtn.disabled = true;
            aiBtn.innerHTML = 'Generating...';

            try {
                const res = await fetch('/captions/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ caption, platforms: selectedPlatforms })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                selectedPlatforms.forEach(p => {
                    const box = document.getElementById(`caption-box-${p}`);
                    if (box) box.classList.remove('hidden');
                    const textarea = document.querySelector(`textarea[name="caption_${p}"]`);
                    if (textarea && data.captions && data.captions[p]) {
                        textarea.value = data.captions[p];
                    }
                });
            } catch (e) {
                alert('Caption generation failed: ' + e.message);
            } finally {
                aiBtn.disabled = false;
                aiBtn.innerHTML = originalText;
            }
        });
    }
});
