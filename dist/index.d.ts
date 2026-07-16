import { MusicConnector, MusicConnectorMeta, MusicConnectorLoginRequest, MusicConnectorLoginResult, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicLyrics, MusicPlaylistQuery, MusicPlaylistList, MusicFavoriteTracksQuery, MusicFavoriteTrackList, MusicFavoriteMutationResult } from '@dancingmusic/music-connect';

/**
 * QQ Music account connector for DancingMusic.
 *
 * The host owns credential capture and persistence. This connector only
 * validates the host-injected cookie and keeps it in memory for login status.
 * Catalog gateway requests are intentionally credential-free.
 */

declare const QQ_MUSIC_ARTWORK_ORIGINS: readonly ["https://y.gtimg.cn", "https://y.qq.com"];
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
    private songReferences;
    init(config?: Record<string, unknown>, host?: QQMusicAccountHost): Promise<void>;
    login(request?: MusicConnectorLoginRequest): Promise<MusicConnectorLoginResult>;
    search(query: MusicListQuery): Promise<MusicSearchResult>;
    getTrack(trackId: string): Promise<MusicTrack | null>;
    getStreamUrl(trackId: string): Promise<MusicStreamInfo | null>;
    getLyrics(trackId: string): Promise<MusicLyrics | null>;
    listPlaylists(query?: MusicPlaylistQuery): Promise<MusicPlaylistList>;
    getPlaylistTracks(playlistId: string, opts?: {
        page?: number;
        pageSize?: number;
    }): Promise<MusicSearchResult>;
    listFavoriteTracks(query?: MusicFavoriteTracksQuery): Promise<MusicFavoriteTrackList>;
    setTrackFavorite(trackId: string, favorite: boolean): Promise<MusicFavoriteMutationResult>;
    private startWebLogin;
    private parseTrackId;
    private parsePlaylistId;
    private rememberOfficialTracks;
    private official;
    private refreshProfile;
}

export { type QQMusicAccountConfig, QQMusicAccountConnector, QQ_MUSIC_ARTWORK_ORIGINS, QQMusicAccountConnector as default };
