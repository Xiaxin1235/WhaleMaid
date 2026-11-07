export type WelcomeArtKind = 'motion' | 'still';
/** Missing artwork is not an error: the dialog renders without an image. */
export declare function welcomeArt(kind: WelcomeArtKind, root?: URL): Promise<string | undefined>;
