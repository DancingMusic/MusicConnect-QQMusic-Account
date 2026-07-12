import { MusicConnector, MusicConnectorMeta, MusicConnectorLoginRequest, MusicConnectorLoginResult, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicPlaylistQuery, MusicPlaylistList } from '@dancingmusic/music-connect';

/**
 * QQ Music account connector for DancingMusic.
 *
 * The host owns credential capture and persistence. This connector only
 * validates the host-injected cookie and keeps it in memory for login status.
 * Catalog gateway requests are intentionally credential-free.
 */

interface QQMusicAccountConfig {
    apiBaseUrl?: string;
    /** Secret injected at runtime by the DancingMusic host credential vault. */
    cookie?: string;
}
declare class QQMusicAccountConnector implements MusicConnector {
    readonly meta: MusicConnectorMeta;
    private baseUrl;
    private cookie;
    init(config?: Record<string, unknown>): Promise<void>;
    login(request?: MusicConnectorLoginRequest): Promise<MusicConnectorLoginResult>;
    search(query: MusicListQuery): Promise<MusicSearchResult>;
    getTrack(trackId: string): Promise<MusicTrack | null>;
    getStreamUrl(trackId: string): Promise<MusicStreamInfo | null>;
    listPlaylists(query?: MusicPlaylistQuery): Promise<MusicPlaylistList>;
    getPlaylistTracks(playlistId: string, opts?: {
        page?: number;
        pageSize?: number;
    }): Promise<MusicSearchResult>;
    private startWebLogin;
    private parseTrackId;
    private parsePlaylistId;
    private request;
}

export { type QQMusicAccountConfig, QQMusicAccountConnector, QQMusicAccountConnector as default };
