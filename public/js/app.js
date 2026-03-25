document.addEventListener('DOMContentLoaded', () => {
    // Media Preview
    const mediaInput = document.getElementById('media-input');
    const previewContainer = document.getElementById('preview-container');
    const uploadPrompt = document.getElementById('upload-prompt');

    if (mediaInput) {
        mediaInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    previewContainer.innerHTML = '';
                    previewContainer.classList.remove('hidden');
                    uploadPrompt.classList.add('hidden');

                    if (file.type.startsWith('image/')) {
                        const img = document.createElement('img');
                        img.src = event.target.result;
                        img.className = 'w-full h-full object-cover';
                        previewContainer.appendChild(img);
                    } else if (file.type.startsWith('video/')) {
                        const video = document.createElement('video');
                        video.src = event.target.result;
                        video.controls = true;
                        video.className = 'w-full h-full object-cover';
                        previewContainer.appendChild(video);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Platform Caption Toggles
    const toggles = document.querySelectorAll('.platform-toggle');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const platform = e.target.getAttribute('data-platform');
            const box = document.getElementById(`caption-box-${platform}`);
            if (e.target.checked) {
                box.classList.remove('hidden');
            } else {
                box.classList.add('hidden');
            }
        });
    });

    // AI Caption Button (Stub for Phase 6)
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
                    const textarea = document.querySelector(`textarea[name="caption_${p}"]`);
                    // Ensure the caption box is visible (it should be if mapped to the checked platform toggle)
                    const box = document.getElementById(`caption-box-${p}`);
                    if (box) box.classList.remove('hidden');

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
