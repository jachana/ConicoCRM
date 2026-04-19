import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';
export function useAuth() {
    const { user, accessToken, setAuth, logout } = useAuthStore();
    async function login(email, password) {
        const form = new FormData();
        form.append('username', email);
        form.append('password', password);
        const tokenRes = await api.post('/api/auth/login', form);
        const meRes = await api.get('/api/auth/me', {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
        });
        setAuth(meRes.data, tokenRes.data.access_token, tokenRes.data.refresh_token);
    }
    return { user, isAuthenticated: !!accessToken, login, logout };
}
