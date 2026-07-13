import { MusicConnector, MusicConnectorMeta, MusicConnectorLoginRequest, MusicConnectorLoginResult, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicPlaylistQuery, MusicPlaylistList } from '@dancingmusic/music-connect';

/**
 * QQ Music account connector for DancingMusic.
 *
 * The host owns credential capture and persistence. This connector only
 * validates the host-injected cookie and keeps it in memory for login status.
 * Catalog gateway requests are intentionally credential-free.
 */

interface QQMusicAccountConfig {
    /** Secret injected at runtime by the DancingMusic host credential vault. */
    cookie?: string;
}
interface QQMusicAccountHost {
    officialProviderRequest?<T = unknown>(operation: string, params?: Record<string, unknown>): Promise<T>;
}
declare class QQMusicAccountConnector implements MusicConnector {
    readonly meta: MusicConnectorMeta;
    private cookie;
    private host;
    private profile;
    private tracks;
    private mediaMids;
    init(config?: Record<string, unknown>, host?: QQMusicAccountHost): Promise<void>;
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
    private official;
    private refreshProfile;
}

export { type QQMusicAccountConfig, QQMusicAccountConnector, QQMusicAccountConnector as default };
