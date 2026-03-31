import axios from 'axios';

export async function getIceServers() {
  try {
    const { XIRSYS_IDENT, XIRSYS_SECRET, XIRSYS_CHANNEL } = process.env;
    if (!XIRSYS_IDENT || !XIRSYS_SECRET || !XIRSYS_CHANNEL) {
      console.warn('⚠️ Xirsys credentials missing, using fallback STUN+TURN');
      return getFallbackIceServers();
    }

    const url = `https://global.xirsys.net/_turn/${XIRSYS_CHANNEL}`;
    const auth = Buffer.from(`${XIRSYS_IDENT}:${XIRSYS_SECRET}`).toString('base64');

    const response = await axios.put(url, {}, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000, // tăng timeout lên 15s
    });

    const iceServers = response.data?.v?.iceServers;
    if (!iceServers || !iceServers.length) {
      throw new Error('No ICE servers returned');
    }

    console.log('✅ Fetched ICE servers from Xirsys:', iceServers);
    return iceServers;
  } catch (err) {
    console.error('❌ Failed to fetch Xirsys ICE servers:', err.message);
    console.log('🔄 Using fallback ICE servers (STUN + TURN from Open Relay)');
    return getFallbackIceServers();
  }
}

function getFallbackIceServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
}