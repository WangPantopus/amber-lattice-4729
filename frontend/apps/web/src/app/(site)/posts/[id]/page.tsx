import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buildCanonicalAppUrlForPost,
  buildCanonicalPathForPost,
  buildCanonicalShareUrlForPost,
  buildPostAppUrl,
  buildPostPath,
  buildPostShareUrl,
} from '@pantopus/utils';
import {
  buildShareMetadata,
  displayNameForUser,
  fetchPublicPost,
  formatLocationLine,
  getStoreDownloadCta,
  pickPreviewImage,
  storePlatform,
  summarizeText,
} from '@/lib/publicShare';
import OpenInAppButton from '@/components/public-share/OpenInAppButton';
import JustInstalledHint from '@/components/public-share/JustInstalledHint';
import StoreLink from '@/components/public-share/StoreLink';
import { authPageHref } from '@/lib/auth-utils';

const STORY_TOPICS: Record<string, string> = {
  events: 'Events', kids: 'Kids & schools', sports: 'Sports', government: 'Government', business: 'Business',
  safety: 'Roads & safety',
};

/**
 * A story Today's Around you posted for an outlet (the server marks it in `post_metadata.around_you` and gives every
 * reader the outlet's name and link): the outlet published it, so this page names the outlet, links to the story
 * there and sets the headline apart from the outlet's summary. Null for every other post.
 */
function storyOf(post: { content?: string | null; post_metadata?: Record<string, unknown> | null }) {
  const meta = post.post_metadata;
  const around = meta?.around_you as { topics?: unknown } | undefined;
  if (!around || typeof around !== 'object') return null;
  const text = String(post.content || '');
  const cut = text.indexOf('\n');
  let link: string | null = null;
  try {
    const url = new URL(String(meta?.source_url || ''));
    if (url.protocol === 'https:' || url.protocol === 'http:') link = url.href;
  } catch { /* no link */ }
  const name = typeof meta?.source_name === 'string' ? meta.source_name.trim() : '';
  const topics = Array.isArray(around.topics) ? around.topics : [];
  return {
    headline: (cut < 0 ? text : text.slice(0, cut)).trim(),
    summary: cut < 0 ? '' : text.slice(cut + 1).trim(),
    outlet: name.replace(/\s*\(subscription\)$/i, '') || null,
    readAt: name || null,
    link,
    topic: topics.map((topic) => STORY_TOPICS[String(topic)]).find(Boolean) ?? 'Local news',
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchPublicPost(id);
  const post = result.data;

  if (!post) {
    return {
      title: 'Post Not Available | Pantopus',
      description: result.status === 403
        ? 'This post is not publicly shareable.'
        : result.status === 404
          ? 'This Pantopus post could not be found.'
          : 'This post could not be loaded. Please try again.',
    };
  }

  const metaShareRef = {
    id,
    ref_task_id: post.ref_task_id ?? null,
    ref_listing_id: post.ref_listing_id ?? null,
  };

  const metaStory = storyOf(post);
  return buildShareMetadata({
    title: metaStory?.headline || post.title || post.post_type || 'Pantopus post',
    description: summarizeText(
      metaStory ? (metaStory.summary || `From ${metaStory.outlet || 'a local outlet'}, on Pantopus.`) : post.content,
      160,
      'See this post on Pantopus.'
    ),
    path: buildCanonicalPathForPost(metaShareRef),
    appArgument: buildCanonicalAppUrlForPost(metaShareRef),
    image: pickPreviewImage(post.media_urls, post.media_live_urls),
  });
}

export default async function PublicPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchPublicPost(id);
  const post = result.data;
  const userAgent = (await headers()).get('user-agent') || '';
  // Getting the app from this page carries the post's link through the install.
  const storeCta = getStoreDownloadCta(userAgent, buildPostPath(id));
  const fallbackUrl = storeCta?.href ?? null;
  const copyPath = storeCta?.copyPath ?? null;

  if (!post && result.status === 404) {
    notFound();
  }

  if (!post) {
    // Only a 403 means the post is not shareable; any other failure is a failed read.
    const accessRestricted = result.status === 403;
    return (
      <main className="min-h-screen bg-app text-app">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 text-center sm:px-6">
          <p className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-app-text-secondary">
            Post Share
          </p>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-app">
            {accessRestricted ? "This post isn't publicly shareable" : "Couldn't load this post"}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-app-text-secondary">
            {accessRestricted
              ? 'The link works, but this post can only be viewed by people who have access to it in Pantopus.'
              : 'Something went wrong while loading this page. Please try again.'}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            {!accessRestricted ? (
              <a
                href={`/posts/${encodeURIComponent(id)}`}
                className="rounded-full border border-app px-5 py-2.5 text-sm font-semibold text-app hover:bg-surface-muted"
              >
                Try Again
              </a>
            ) : null}
            <OpenInAppButton
              appUrl={buildPostAppUrl(id)}
              linkHref={buildPostShareUrl(id)}
              fallbackUrl={fallbackUrl}
              copyPath={copyPath}
              className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Open In Pantopus
            </OpenInAppButton>
            {storeCta ? (
              <StoreLink
                href={storeCta.href}
                copyPath={copyPath}
                className="rounded-full border border-app px-5 py-2.5 text-sm font-semibold text-app hover:bg-surface-muted"
              >
                {storeCta.label}
              </StoreLink>
            ) : null}
            {accessRestricted ? (
              // Signed-in visitors never see this page (the middleware opens the post in the app),
              // so on a computer signing in is the way through.
              <Link
                href={authPageHref('/login', `/app/feed/post/${encodeURIComponent(id)}`)}
                className="rounded-full border border-app px-5 py-2.5 text-sm font-semibold text-app hover:bg-surface-muted"
              >
                Sign In To View
              </Link>
            ) : null}
            <Link
              href="/"
              className="rounded-full border border-app px-5 py-2.5 text-sm font-semibold text-app hover:bg-surface-muted"
            >
              Back To Pantopus
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const creatorName = displayNameForUser(post.creator, 'Pantopus member');
  const story = storyOf(post);
  const replies = Number(post.comment_count) || 0;
  const image = pickPreviewImage(post.media_urls, post.media_live_urls);
  // The public author has no city or state; the post's own place name is its location. A Home post's place is its
  // city, which is also the Home's public name, so the byline says it once.
  const placeName = formatLocationLine(post.location_name);
  const location = placeName !== creatorName ? placeName : null;
  const shareRef = {
    id,
    ref_task_id: post.ref_task_id ?? null,
    ref_listing_id: post.ref_listing_id ?? null,
  };

  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-semibold text-app hover:opacity-80">
            Pantopus
          </Link>
          <div className="flex items-center gap-3">
            <OpenInAppButton
              appUrl={buildCanonicalAppUrlForPost(shareRef)}
              linkHref={buildCanonicalShareUrlForPost(shareRef)}
              fallbackUrl={fallbackUrl}
              copyPath={copyPath}
              className="rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Open In App
            </OpenInAppButton>
          </div>
        </div>

        <article className="overflow-hidden rounded-3xl border border-app bg-surface shadow-sm">
          {image ? (
            <div className="aspect-[16/9] w-full bg-surface-muted">
              <img
                src={image}
                alt={post.title || 'Pantopus post'}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-app-text-secondary">
              <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-700">
                {story ? story.topic : post.post_type || 'Post'}
              </span>
              {post.state ? (
                <span className="rounded-full bg-surface-muted px-3 py-1">
                  {String(post.state).replace(/_/g, ' ')}
                </span>
              ) : null}
            </div>

            {story ? (
              <div data-testid="publicStory">
                <h1 className="text-2xl font-semibold tracking-tight text-app sm:text-3xl break-words">
                  {story.headline}
                </h1>
                {story.summary ? (
                  <p className="mt-3 text-base leading-7 text-app-text-secondary break-words">{story.summary}</p>
                ) : null}
                {story.link ? (
                  <a
                    href={story.link}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    data-testid="publicStoryLink"
                    className="mt-4 inline-flex rounded-full border border-app px-4 py-2 text-sm font-semibold text-app hover:bg-surface-muted"
                  >
                    {story.readAt ? `Read at ${story.readAt}` : 'Read the story'}
                  </a>
                ) : null}
              </div>
            ) : (
            <div>
              {post.title ? (
                <h1 className="text-3xl font-semibold tracking-tight text-app sm:text-4xl">
                  {post.title}
                </h1>
              ) : null}
              <p className="mt-3 text-base leading-7 text-app-text-secondary whitespace-pre-wrap break-words">
                {post.content || ''}
              </p>
            </div>
            )}

            <div className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-app-text-secondary">
              <span className="font-semibold text-app">{story?.outlet || creatorName}</span>
              {story?.outlet ? ` · via ${creatorName}` : ''}
              {location ? ` · ${location}` : ''}
              {post.created_at ? ` · ${new Date(post.created_at).toLocaleString()}` : ''}
            </div>
          </div>
        </article>

        <div className="mt-6 rounded-3xl border border-app bg-surface p-6 shadow-sm">
          <p className="text-sm leading-6 text-app-text-secondary" data-testid="publicPostInvite">
            {story && replies > 0
              ? `${replies === 1 ? '1 reply' : `${replies} replies`} from people around here so far. Open it in Pantopus to read ${replies === 1 ? 'it' : 'them'} and add yours.`
              : story
                ? 'Open this story in Pantopus to say what you think; people around here will see your reply.'
                : 'Open this post in Pantopus to reply, react, and keep up with the conversation.'}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={authPageHref('/login', `/app/feed/post/${encodeURIComponent(id)}`)}
              className="rounded-full border border-app px-5 py-2.5 text-center text-sm font-semibold text-app hover:bg-surface-muted"
            >
              Join the conversation
            </Link>
            <OpenInAppButton
              appUrl={buildCanonicalAppUrlForPost(shareRef)}
              linkHref={buildCanonicalShareUrlForPost(shareRef)}
              fallbackUrl={fallbackUrl}
              copyPath={copyPath}
              className="rounded-full bg-primary-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-700"
            >
              Open In Pantopus
            </OpenInAppButton>
            {storeCta ? (
              <StoreLink
                href={storeCta.href}
                copyPath={copyPath}
                className="rounded-full border border-app px-5 py-2.5 text-center text-sm font-semibold text-app hover:bg-surface-muted"
              >
                {storeCta.label}
              </StoreLink>
            ) : null}
            <Link
              href="/"
              className="rounded-full border border-app px-5 py-2.5 text-center text-sm font-semibold text-app hover:bg-surface-muted"
            >
              Back To Pantopus
            </Link>
          </div>
          {storeCta ? <div className="mt-4"><JustInstalledHint what="this post" platform={storePlatform(userAgent)} /></div> : null}
        </div>
      </div>
    </main>
  );
}
