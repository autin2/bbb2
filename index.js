const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// POST route to generate caption
app.post('/generate', (req, res) => {
  const { url, includeEmojis } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const videoFilePath = path.join(__dirname, 'video1.webm');
  const audioFilePath = path.join(__dirname, 'audio.wav');

  // Download video
  exec(`yt-dlp --no-playlist -f bestaudio[ext=webm]/bestaudio -o "video1.webm" ${url}`, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to download video' });

    // Extract audio
    exec(`ffmpeg -i "${videoFilePath}" -vn -acodec pcm_s16le -ar 44100 -ac 2 "${audioFilePath}"`, async (err) => {
      if (err) return res.status(500).json({ error: 'Failed to extract audio from video' });

      try {
        // TRANSCRIBE AUDIO using Whisper
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioFilePath));
        formData.append('model', 'whisper-1');

        const whisperRes = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          }
        });

        const transcript = whisperRes.data.text;
        console.log('Transcript:', transcript);

        // Adjust GPT Prompt based on emoji choice
        const gptPrompt = `
Summarize the following transcript into a short, engaging caption for TikTok or Instagram Reels. 
Make it algorithm based, catchy, and include 15 relevant trending hashtags with the first three being: "#fyp, #viral, #foryoupage." and have them after the text caption
${includeEmojis ? 'Use emojis in the caption to make it more lively and engaging.' : 'Do NOT use a single emoji in the anywhere in the caption. Absolutely no emojis'}

Transcript:
${transcript}
`;

        const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a social media assistant.' },
            { role: 'user', content: gptPrompt }
          ],
          temperature: 0.7,
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        const caption = gptRes.data.choices[0].message.content.trim();
        res.json({ caption });

        // Cleanup files after response
        if (fs.existsSync(videoFilePath)) fs.unlinkSync(videoFilePath);
        if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);

      } catch (err) {
        console.error('Transcription or GPT Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to generate caption from audio.' });
      }
    });
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
