import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  Bell,
  Ellipsis,
  Flag,
  Heart,
  ImagePlus,
  MessageSquareText,
  RefreshCw,
  SendHorizontal,
  Trash2,
  UserX,
  X
} from "lucide-react-native";
import type { ClubAccess, ClubActivityItem, ClubCommentWithAuthor, ClubFeedItem, ClubRiderProfile, ClubSpace, UploadAsset } from "../../backend";
import { equinaFeatureFlags } from "../../config/feature-flags";
import { EquinaButton, EquinaIconButton, EquinaSegmentedTabs, EquinaSheet } from "../../ui/primitives/EquinaPrimitives";
import { equinaTheme } from "../../ui/theme/theme";
import { clubReportReasons, relativeTime, type ClubReportReason } from "./club-format";
import {
  clubFilterChips,
  clubPhotoProblem,
  clubSpaceImageKey,
  composerPrompt,
  composerSpaceSlug,
  orderClubSpaces,
  feedEmptyState,
  latestActivityLabel,
  sameScope,
  type ClubSpaceImageKey
} from "./club-groups";
import { activityVerb, profileGroups, threadComments, unreadLabel } from "./club-social";
import { prepareClubPhoto } from "./club-photo";
import type { ClubController } from "./useClub";

const postLimit = 2000;
const commentLimit = 1200;
// iOS shows one Modal at a time: going from one sheet to another closes the
// first and opens the next once it has slid away.
const sheetSwitchMs = 380;

type ClubTab = "feed" | "groups";

export type ClubRideShare = {
  id: string;
  horseId?: string;
  /** "Ralfy · 32 min · Rhythm · felt focused" */
  summary: string;
};

export function ClubScreen({
  club,
  access = "post",
  upgradeName = "Plus",
  onSeePlans,
  canPost,
  canInteract,
  currentUserId,
  riderName,
  defaultSpaceSlug,
  spaceImages,
  rideToShare,
  composeRequest,
  onNotice
}: {
  club: ClubController;
  /**
   * What the rider's plan opens (202610060001): nothing, the feed to read, or
   * all of it. The database applies the same rule to every query.
   */
  access?: ClubAccess;
  /** The plan that opens the Club, named on the locked screen. */
  upgradeName?: string;
  onSeePlans?: () => void;
  canPost: boolean;
  canInteract: boolean;
  currentUserId?: string;
  riderName: string;
  defaultSpaceSlug: string;
  /** The editorial photo behind each group card, by image key. */
  spaceImages: Record<ClubSpaceImageKey, string>;
  /** The rider's latest ride, offered as an attachment in the composer. */
  rideToShare?: ClubRideShare;
  /** Incremented to open the composer with the ride attached ("Share ride"). */
  composeRequest: number;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<ClubTab>("feed");
  const [composer, setComposer] = useState<{ attachRide: boolean } | null>(null);
  const [commentsFor, setCommentsFor] = useState<ClubFeedItem | null>(null);
  const [optionsFor, setOptionsFor] = useState<ClubFeedItem | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(switchTimer.current), []);
  const switchSheet = (open: () => void) => {
    setComposer(null);
    setCommentsFor(null);
    setOptionsFor(null);
    setProfileFor(null);
    setActivityOpen(false);
    clearTimeout(switchTimer.current);
    switchTimer.current = setTimeout(open, sheetSwitchMs);
  };
  // A post someone is told about, or found on a profile, opens on its
  // comments: the post on top, the thread below.
  const openPostComments = (postId: string) => switchSheet(() => {
    void club.loadPost(postId).then((item) => {
      if (item) setCommentsFor(item);
      else onNotice("This post is no longer in the Club.");
    });
  });
  // Photos wait for EXIF and GPS removal (feature-flags.ts).
  const photoPosts = canPost && equinaFeatureFlags.clubPhotoPosts;

  useEffect(() => {
    if (composeRequest > 0 && canPost) setComposer({ attachRide: Boolean(rideToShare) });
    // Only a new request opens the composer, not a change to the ride.
  }, [composeRequest]);

  const spaceName = (spaceId: string) => club.spaces.find((space) => space.id === spaceId)?.name ?? "Club";
  const activeSpace = club.spaces.find((space) => space.id === club.spaceId);
  const joined = new Set(club.joinedSpaceIds);
  const emptyState = feedEmptyState({
    scope: club.scope,
    spaceName: activeSpace?.name,
    canPost,
    hasMemberships: club.joinedSpaceIds.length > 0
  });

  // A group card opens the feed on that group.
  const openGroupFeed = (spaceId: string) => {
    club.selectScope({ kind: "space", spaceId });
    setTab("feed");
  };

  // Joining takes the rider into the group: its posts, with the group named
  // on top. Staying on the list after Join read as if nothing had happened.
  const joinAndOpen = async (space: ClubSpace) => {
    if (!(await club.joinSpace(space.id))) return;
    openGroupFeed(space.id);
    onNotice(`You joined ${space.name}.`);
  };

  if (access === "none") {
    return (
      <View style={styles.screen}>
        <View testID="club-locked" style={styles.notice}>
          <Text style={styles.noticeTitle}>The Club comes with {upgradeName}.</Text>
          <Text style={styles.noticeBody}>
            Riders share their rides here, by discipline, and ask questions in Coach Q&A. Your rides and records
            stay private either way.
          </Text>
          {onSeePlans ? (
            <EquinaButton testID="club-see-plans" label="See plans" variant="secondary" onPress={onSeePlans} style={styles.noticeAction} />
          ) : null}
        </View>
      </View>
    );
  }

  if (!club.enabled) {
    return (
      <View style={styles.screen}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Club is not open for this account yet.</Text>
          <Text style={styles.noticeBody}>Your rides and records stay private. Club opens as soon as your account is added.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <EquinaSegmentedTabs<ClubTab>
        testIDPrefix="club-tab"
        value={tab}
        onChange={setTab}
        tabs={[{ value: "feed", label: "Feed" }, { value: "groups", label: "Groups" }]}
      />

      {tab === "feed" ? (
        <View style={styles.topBar}>
          {canPost ? (
            <Pressable
              testID="club-compose"
              accessibilityRole="button"
              accessibilityLabel="Write a post"
              onPress={() => setComposer({ attachRide: false })}
              style={({ pressed }) => [styles.composerRow, pressed && styles.pressed]}
            >
              <Avatar name={riderName} />
              <Text style={styles.composerPrompt}>{composerPrompt(photoPosts)}</Text>
            </Pressable>
          ) : (
            <Text style={styles.feedLabel}>Latest from your Club</Text>
          )}
          <Pressable
            testID="club-activity"
            accessibilityRole="button"
            accessibilityLabel={club.unreadActivity > 0 ? `Activity, ${club.unreadActivity} new` : "Activity"}
            onPress={() => setActivityOpen(true)}
            style={styles.iconButton}
          >
            <Bell size={19} color={club.unreadActivity > 0 ? equinaTheme.colors.brass : equinaTheme.text.secondary} />
            {club.unreadActivity > 0 ? (
              <View style={styles.bellBadge} pointerEvents="none">
                <Text style={styles.bellBadgeText}>{unreadLabel(club.unreadActivity)}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            testID="club-refresh"
            accessibilityRole="button"
            accessibilityLabel="Refresh the feed"
            disabled={club.loading}
            onPress={() => void club.refresh()}
            style={styles.iconButton}
          >
            {club.loading
              ? <ActivityIndicator size="small" color={equinaTheme.colors.brass} />
              : <RefreshCw size={18} color={equinaTheme.text.secondary} />}
          </Pressable>
        </View>
      ) : null}

      {access === "read" ? (
        <Pressable
          testID="club-read-only"
          accessibilityRole={onSeePlans ? "button" : undefined}
          disabled={!onSeePlans}
          onPress={onSeePlans}
          style={({ pressed }) => [styles.readOnlyNote, pressed && styles.pressed]}
        >
          <Text style={styles.noticeBody}>
            Posting, comments and reactions come with {upgradeName}.{onSeePlans ? " See plans" : ""}
          </Text>
        </Pressable>
      ) : null}

      {tab === "feed" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {clubFilterChips(club.spaces, club.joinedSpaceIds, club.scope).map((chip) => (
            <SpaceChip
              key={chip.key}
              testID={`club-filter-${chip.key}`}
              label={chip.label}
              selected={sameScope(club.scope, chip.scope)}
              onPress={() => club.selectScope(chip.scope)}
            />
          ))}
        </ScrollView>
      ) : null}

      {tab === "feed" && activeSpace ? (
        <ClubGroupHeader
          space={activeSpace}
          image={spaceImages[clubSpaceImageKey(activeSpace.slug)]}
          joined={joined.has(activeSpace.id)}
          canJoin={canInteract}
          onJoin={() => {
            void club.joinSpace(activeSpace.id).then((done) => {
              if (done) onNotice(`You joined ${activeSpace.name}.`);
            });
          }}
          onLeave={() => void club.leaveSpace(activeSpace.id)}
        />
      ) : null}

      {club.error ? (
        <Pressable
          accessibilityRole="alert"
          onPress={() => {
            club.clearError();
            void club.refresh();
          }}
          style={styles.errorBanner}
        >
          <Text style={styles.errorText}>{club.error}</Text>
          <Text style={styles.errorAction}>Tap to try again</Text>
        </Pressable>
      ) : null}

      {tab === "feed" && ((!club.loaded && club.loading) || (club.scope.kind === "mine" && !club.membershipsLoaded)) ? (
        <ActivityIndicator style={styles.loading} color={equinaTheme.colors.brass} />
      ) : null}

      {tab === "feed" && club.loaded && club.items.length === 0 && (club.scope.kind !== "mine" || club.membershipsLoaded) ? (
        <View style={styles.notice} testID="club-feed-empty">
          <Text style={styles.noticeTitle}>{emptyState.title}</Text>
          <Text style={styles.noticeBody}>{emptyState.body}</Text>
          {emptyState.action === "groups" ? (
            <EquinaButton
              testID="club-feed-see-groups"
              label="See groups"
              variant="secondary"
              onPress={() => setTab("groups")}
              style={styles.noticeAction}
            />
          ) : null}
        </View>
      ) : null}

      {tab === "feed" ? club.items.map((item) => (
        <ClubPostCard
          key={item.post.id}
          item={item}
          spaceName={spaceName(item.post.spaceId)}
          canInteract={canInteract}
          onLike={() => void club.toggleLike(item.post.id)}
          onComments={() => setCommentsFor(item)}
          onOptions={() => setOptionsFor(item)}
          onAuthor={() => setProfileFor(item.author.id)}
        />
      )) : null}

      {tab === "feed" && club.hasMore && club.items.length > 0 ? (
        <EquinaButton
          testID="club-load-more"
          label={club.loadingMore ? "Loading..." : "Load more"}
          variant="secondary"
          showArrow={false}
          disabled={club.loadingMore}
          onPress={() => void club.loadMore()}
        />
      ) : null}

      {tab === "groups" ? (
        <>
          <Text style={styles.noticeBody}>
            Join a group to go straight to its posts and follow it under "My groups" in the feed. Every group stays open to read.
          </Text>
          {!club.spaces.length && club.loading ? (
            <ActivityIndicator style={styles.loading} color={equinaTheme.colors.brass} />
          ) : null}
          {orderClubSpaces(club.spaces, defaultSpaceSlug).map((space) => (
            <ClubGroupCard
              key={space.id}
              space={space}
              image={spaceImages[clubSpaceImageKey(space.slug)]}
              joined={joined.has(space.id)}
              activity={latestActivityLabel(space.id, club.items)}
              canJoin={canInteract}
              onOpen={() => openGroupFeed(space.id)}
              onJoin={() => void joinAndOpen(space)}
              onLeave={() => void club.leaveSpace(space.id)}
            />
          ))}
        </>
      ) : null}

      <ComposerSheet
        visible={Boolean(composer)}
        spaces={club.spaces}
        defaultSpaceSlug={composerSpaceSlug(club.scope, club.spaces, defaultSpaceSlug)}
        ride={rideToShare}
        startWithRide={Boolean(composer?.attachRide)}
        allowPhoto={photoPosts}
        busy={club.busy === "post"}
        onDismiss={() => setComposer(null)}
        onSubmit={async (input) => {
          const result = await club.createPost(input);
          if (!result) return false;
          setComposer(null);
          // Show the space the post went to; a feed filtered elsewhere would
          // hide it and the rider would think it was lost.
          const hidesPost = club.scope.kind === "space"
            ? club.scope.spaceId !== input.spaceId
            : club.scope.kind === "mine" && !joined.has(input.spaceId);
          if (result.published && hidesPost) club.selectScope({ kind: "space", spaceId: input.spaceId });
          onNotice(!result.published
            ? "Your post was not published because it matched the Club guidelines."
            : result.photoFailed
              ? "Posted, but the photo could not be uploaded."
              : "Posted to Club.");
          return true;
        }}
      />

      <CommentsSheet
        item={commentsFor}
        liveCommentCount={club.items.find((entry) => entry.post.id === commentsFor?.post.id)?.commentCount}
        canComment={canInteract}
        currentUserId={currentUserId}
        riderName={riderName}
        club={club}
        onDismiss={() => setCommentsFor(null)}
        onNotice={onNotice}
        onOpenProfile={(riderId) => switchSheet(() => setProfileFor(riderId))}
      />

      <ProfileSheet
        riderId={profileFor}
        currentUserId={currentUserId}
        club={club}
        onDismiss={() => setProfileFor(null)}
        onNotice={onNotice}
        onOpenPost={openPostComments}
        onOpenGroup={(spaceId) => {
          setProfileFor(null);
          openGroupFeed(spaceId);
        }}
      />

      <ActivitySheet
        visible={activityOpen}
        club={club}
        onDismiss={() => setActivityOpen(false)}
        onOpenPost={openPostComments}
      />

      <OptionsSheet
        item={optionsFor}
        ownPost={optionsFor?.author.id === currentUserId}
        onDismiss={() => setOptionsFor(null)}
        onDelete={async () => {
          if (!optionsFor) return;
          if (await club.deletePost(optionsFor.post.id)) onNotice("Post deleted.");
          setOptionsFor(null);
        }}
        onReport={async (reason) => {
          if (!optionsFor) return;
          if (await club.report({ postId: optionsFor.post.id }, reason)) {
            onNotice("Thanks. The post is hidden for you and the team will review it.");
          }
          setOptionsFor(null);
        }}
        onBlock={async () => {
          if (!optionsFor) return;
          if (await club.block(optionsFor.author.id)) {
            onNotice(`${optionsFor.author.displayName} is blocked. You will not see each other in Club.`);
          }
          setOptionsFor(null);
        }}
      />
    </View>
  );
}

function ClubPostCard({
  item,
  spaceName,
  canInteract,
  onLike,
  onComments,
  onOptions,
  onAuthor
}: {
  item: ClubFeedItem;
  spaceName: string;
  canInteract: boolean;
  onLike: () => void;
  onComments: () => void;
  onOptions: () => void;
  onAuthor: () => void;
}) {
  const liked = Boolean(item.myReaction);
  const image = item.media.find((entry) => entry.mediaType === "image" && entry.signedUrl);
  const meta = `${spaceName} · ${relativeTime(item.post.createdAt)}`;
  return (
    <View style={styles.card} testID={`club-post-${item.post.id}`}>
      <View style={styles.cardHeader}>
        <Pressable
          testID={`club-author-${item.post.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.author.displayName}'s profile`}
          onPress={onAuthor}
          style={({ pressed }) => [styles.cardAuthor, pressed && styles.pressed]}
        >
          <Avatar name={item.author.displayName} uri={item.author.avatarUrl} />
          <View style={styles.cardHeading}>
            <Text numberOfLines={1} style={styles.author}>{item.author.displayName}</Text>
            <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${item.author.displayName}'s post`}
          onPress={onOptions}
          style={styles.iconButton}
        >
          <Ellipsis size={18} color={equinaTheme.text.tertiary} />
        </Pressable>
      </View>
      {item.post.postType === "ride" ? (
        <View style={styles.rideChip}>
          <Text style={styles.rideChipText}>Ride</Text>
        </View>
      ) : null}
      <Text style={styles.body}>{item.post.body}</Text>
      {image ? <Image source={{ uri: image.signedUrl }} style={styles.image} accessibilityIgnoresInvertColors /> : null}
      <View style={styles.actions}>
        <Pressable
          testID={`club-like-${item.post.id}`}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Remove like" : "Like"}
          accessibilityState={{ selected: liked, disabled: !canInteract }}
          disabled={!canInteract}
          onPress={onLike}
          style={styles.action}
        >
          <Heart
            size={18}
            color={liked ? equinaTheme.colors.brass : equinaTheme.text.secondary}
            fill={liked ? equinaTheme.colors.brass : "transparent"}
          />
          <Text style={[styles.actionText, liked && styles.actionTextActive]}>{item.reactionCount}</Text>
        </Pressable>
        <Pressable
          testID={`club-comments-${item.post.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${item.commentCount} comments`}
          onPress={onComments}
          style={styles.action}
        >
          <MessageSquareText size={18} color={equinaTheme.text.secondary} />
          <Text style={styles.actionText}>{item.commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ClubGroupCard({
  space,
  image,
  joined,
  activity,
  canJoin,
  onOpen,
  onJoin,
  onLeave
}: {
  space: ClubSpace;
  image: string;
  joined: boolean;
  /** "Last post 2h ago", from the posts already loaded; absent when none is. */
  activity?: string;
  /** Joining needs the plan's `post` access; without it the card only opens the feed. */
  canJoin: boolean;
  onOpen: () => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.groupCard} testID={`club-group-${space.slug}`}>
      <Pressable
        testID={`club-group-open-${space.slug}`}
        accessibilityRole="button"
        accessibilityLabel={`Open ${space.name} in the feed`}
        onPress={onOpen}
        style={({ pressed }) => [styles.groupBody, pressed && styles.pressed]}
      >
        <Image source={{ uri: image }} style={styles.groupImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={styles.groupText}>
          <View style={styles.groupTitleRow}>
            <Text numberOfLines={1} style={styles.groupName}>{space.name}</Text>
            {joined ? <Text style={styles.groupJoined}>Joined</Text> : null}
          </View>
          {space.description ? <Text numberOfLines={2} style={styles.noticeBody}>{space.description}</Text> : null}
          {activity ? <Text style={styles.meta}>{activity}</Text> : null}
        </View>
      </Pressable>
      {canJoin ? <GroupMembershipButton space={space} joined={joined} onJoin={onJoin} onLeave={onLeave} /> : null}
    </View>
  );
}

/** Inside a group: which group the posts below belong to, and the way out of it. */
function ClubGroupHeader({
  space,
  image,
  joined,
  canJoin,
  onJoin,
  onLeave
}: {
  space: ClubSpace;
  image: string;
  joined: boolean;
  canJoin: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.groupCard} testID={`club-group-header-${space.slug}`}>
      <Image source={{ uri: image }} style={styles.groupHeaderImage} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.groupText}>
        <View style={styles.groupTitleRow}>
          <Text numberOfLines={1} accessibilityRole="header" style={styles.groupName}>{space.name}</Text>
          {joined ? <Text style={styles.groupJoined}>Joined</Text> : null}
        </View>
        {space.description ? <Text style={styles.noticeBody}>{space.description}</Text> : null}
      </View>
      {canJoin ? <GroupMembershipButton space={space} joined={joined} onJoin={onJoin} onLeave={onLeave} /> : null}
    </View>
  );
}

function GroupMembershipButton({
  space,
  joined,
  onJoin,
  onLeave
}: {
  space: ClubSpace;
  joined: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <Pressable
      testID={`club-group-${joined ? "leave" : "join"}-${space.slug}`}
      accessibilityRole="button"
      accessibilityLabel={joined ? `Leave ${space.name}` : `Join ${space.name}`}
      onPress={joined ? onLeave : onJoin}
      style={({ pressed }) => [styles.groupAction, !joined && styles.groupActionJoin, pressed && styles.pressed]}
    >
      <Text style={[styles.groupActionText, !joined && styles.groupActionJoinText]}>{joined ? "Leave" : "Join"}</Text>
    </Pressable>
  );
}

function ComposerSheet({
  visible,
  spaces,
  defaultSpaceSlug,
  ride,
  startWithRide,
  allowPhoto,
  busy,
  onDismiss,
  onSubmit
}: {
  visible: boolean;
  spaces: ClubSpace[];
  defaultSpaceSlug: string;
  ride?: ClubRideShare;
  /** Opened from "Share ride": the ride starts attached. */
  startWithRide: boolean;
  /** Media needs the same plan access as posting; the control is hidden otherwise. */
  allowPhoto: boolean;
  busy: boolean;
  onDismiss: () => void;
  onSubmit: (input: { spaceId: string; body: string; rideId?: string; horseId?: string; photo?: UploadAsset }) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [attachRide, setAttachRide] = useState(false);
  const [photo, setPhoto] = useState<UploadAsset | undefined>(undefined);
  const [photoError, setPhotoError] = useState("");

  // Reset only when the sheet opens. The app re-renders underneath while the
  // rider types (a realtime refresh, a new ride summary object), and that must
  // never wipe the draft.
  useEffect(() => {
    if (!visible) return;
    setText("");
    setAttachRide(startWithRide && Boolean(ride));
    setSpaceId("");
    setPhoto(undefined);
    setPhotoError("");
  }, [visible]);

  const pickPhoto = async () => {
    setPhotoError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError("Allow photo access to add a photo to your post.");
      return;
    }
    // Full quality here: the photo is redrawn as a JPEG once, in prepareClubPhoto.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = await prepareClubPhoto(result.assets[0]);
      const problem = clubPhotoProblem(asset);
      if (problem) {
        setPhotoError(problem);
        return;
      }
      setPhoto(asset);
    } catch (assetError) {
      setPhotoError(assetError instanceof Error ? assetError.message : "Photo could not be prepared.");
    }
  };

  // Spaces can still be loading when the sheet opens; pick the default once
  // they arrive, and never override a space the rider chose.
  useEffect(() => {
    if (!visible || spaceId || !spaces.length) return;
    setSpaceId(spaces.find((space) => space.slug === defaultSpaceSlug)?.id ?? spaces[0]?.id ?? "");
  }, [defaultSpaceSlug, spaceId, spaces, visible]);

  const rideLine = attachRide && ride ? ride.summary : "";
  const body = [text.trim(), rideLine].filter(Boolean).join("\n\n");
  const ready = Boolean(spaceId) && body.length > 0 && body.length <= postLimit && !busy;

  return (
    <EquinaSheet visible={visible} title="New post" onDismiss={onDismiss} closeTestID="club-composer-close">
      <View style={styles.sheetBody}>
        <TextInput
          testID="club-composer-input"
          accessibilityLabel="Post text"
          value={text}
          onChangeText={setText}
          placeholder={composerPrompt(allowPhoto)}
          placeholderTextColor={equinaTheme.text.tertiary}
          multiline
          maxLength={postLimit}
          style={styles.composerInput}
        />
        {allowPhoto && photo ? (
          <View style={styles.photoRow}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} accessibilityIgnoresInvertColors />
            <Text numberOfLines={1} style={styles.photoName}>{photo.fileName}</Text>
            <EquinaIconButton
              testID="club-composer-photo-remove"
              Icon={X}
              label="Remove photo"
              tone="glass"
              iconSize={18}
              onPress={() => setPhoto(undefined)}
            />
          </View>
        ) : null}
        {allowPhoto && !photo ? (
          <Pressable
            testID="club-composer-photo"
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            onPress={() => void pickPhoto()}
            style={({ pressed }) => [styles.attachRow, pressed && styles.pressed]}
          >
            <ImagePlus size={18} color={equinaTheme.colors.brass} />
            <Text style={styles.attachText}>Add photo</Text>
          </Pressable>
        ) : null}
        {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}
        {ride ? (
          <Pressable
            testID="club-composer-ride"
            accessibilityRole="switch"
            accessibilityState={{ checked: attachRide }}
            accessibilityLabel="Attach my last ride"
            onPress={() => setAttachRide((value) => !value)}
            style={[styles.rideToggle, attachRide && styles.rideToggleOn]}
          >
            <Text style={styles.rideToggleTitle}>{attachRide ? "Last ride attached" : "Attach my last ride"}</Text>
            {attachRide && ride ? <Text style={styles.rideToggleBody}>{ride.summary}</Text> : null}
          </Pressable>
        ) : null}
        <Text style={styles.sheetLabel}>Post to</Text>
        <View style={styles.chipsWrap}>
          {spaces.map((space) => (
            <SpaceChip
              key={space.id}
              label={space.name}
              selected={space.id === spaceId}
              onPress={() => setSpaceId(space.id)}
            />
          ))}
        </View>
        <EquinaButton
          testID="club-composer-submit"
          label={busy ? "Posting..." : "Post"}
          disabled={!ready}
          showArrow={false}
          onPress={() => void onSubmit({
            spaceId,
            body,
            rideId: attachRide ? ride?.id : undefined,
            horseId: attachRide ? ride?.horseId : undefined,
            photo: allowPhoto ? photo : undefined
          })}
        />
      </View>
    </EquinaSheet>
  );
}

function CommentsSheet({
  item,
  liveCommentCount,
  canComment,
  currentUserId,
  riderName,
  club,
  onDismiss,
  onNotice,
  onOpenProfile
}: {
  item: ClubFeedItem | null;
  /** The post's comment count as the realtime feed sees it now. */
  liveCommentCount?: number;
  canComment: boolean;
  currentUserId?: string;
  riderName: string;
  club: ClubController;
  onDismiss: () => void;
  onNotice: (message: string) => void;
  onOpenProfile: (riderId: string) => void;
}) {
  const [comments, setComments] = useState<ClubCommentWithAuthor[] | null>(null);
  const [draft, setDraft] = useState("");
  const [reportingId, setReportingId] = useState("");
  // The comment being answered. A reply to a reply joins its thread, as the
  // database files it.
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const postId = item?.post.id;

  useEffect(() => {
    setComments(null);
    setDraft("");
    setReportingId("");
    setReplyTo(null);
  }, [postId]);

  // Loads when the sheet opens, and again whenever the live feed says the
  // count changed -- another rider replying while this thread is open.
  useEffect(() => {
    if (!postId) return;
    let active = true;
    void club.loadComments(postId).then((loaded) => {
      if (active && loaded) setComments(loaded);
      else if (active) setComments((current) => current ?? []);
    });
    return () => { active = false; };
    // club.loadComments is stable for the session.
  }, [postId, liveCommentCount]);

  const sending = Boolean(postId) && club.busy === `comment:${postId}`;
  const send = async () => {
    if (!postId || !draft.trim() || sending) return;
    const comment = await club.addComment(postId, draft, riderName, replyTo?.id);
    if (!comment) return;
    setDraft("");
    setReplyTo(null);
    if (comment.moderationStatus === "visible") {
      setComments((current) => [...(current ?? []), comment]);
    } else {
      onNotice("Your comment was not published because it matched the Club guidelines.");
    }
  };

  return (
    <EquinaSheet visible={Boolean(item)} title="Comments" onDismiss={onDismiss} closeTestID="club-comments-close">
      <View style={styles.sheetBody}>
        {item ? (
          <View style={styles.commentPost}>
            <Text numberOfLines={1} style={styles.meta}>{item.author.displayName}</Text>
            <Text numberOfLines={3} style={styles.noticeBody}>{item.post.body}</Text>
          </View>
        ) : null}
        <ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent}>
          {comments === null ? <ActivityIndicator color={equinaTheme.colors.brass} /> : null}
          {comments?.length === 0 ? <Text style={styles.noticeBody}>No comments yet.</Text> : null}
          {threadComments(comments ?? []).map((comment) => {
            const own = comment.authorId === currentUserId;
            return (
              <View
                key={comment.id}
                testID={`club-comment-${comment.id}`}
                style={[styles.comment, comment.depth === 1 && styles.commentReply]}
              >
                <View style={styles.commentHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${comment.authorName}'s profile`}
                    onPress={() => onOpenProfile(comment.authorId)}
                    hitSlop={6}
                  >
                    <Text style={styles.author}>{comment.authorName}</Text>
                  </Pressable>
                  <Text style={styles.meta}>{relativeTime(comment.createdAt)}</Text>
                </View>
                <Text style={styles.body}>{comment.body}</Text>
                <View style={styles.commentActions}>
                  {canComment ? (
                    <Pressable
                      testID={`club-comment-reply-${comment.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Reply to ${comment.authorName}`}
                      onPress={() => setReplyTo({ id: comment.id, name: comment.authorName })}
                      style={styles.commentAction}
                    >
                      <Text style={styles.commentActionText}>Reply</Text>
                    </Pressable>
                  ) : null}
                  {own ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete your comment"
                      onPress={async () => {
                        if (!postId) return;
                        if (await club.deleteComment(postId, comment.id)) {
                          // Its replies go with it (club_comments.parent_id cascades).
                          setComments((current) => (current ?? []).filter((entry) =>
                            entry.id !== comment.id && entry.parentId !== comment.id
                          ));
                        }
                      }}
                      style={styles.commentAction}
                    >
                      <Text style={styles.commentActionText}>Delete</Text>
                    </Pressable>
                  ) : reportingId === comment.id ? null : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Report ${comment.authorName}'s comment`}
                      onPress={() => setReportingId(comment.id)}
                      style={styles.commentAction}
                    >
                      <Text style={styles.commentActionText}>Report</Text>
                    </Pressable>
                  )}
                </View>
                {!own && reportingId === comment.id ? (
                  <View style={styles.chipsWrap}>
                    {clubReportReasons.map((reason) => (
                      <SpaceChip
                        key={reason.value}
                        label={reason.label}
                        selected={false}
                        onPress={async () => {
                          if (await club.report({ commentId: comment.id }, reason.value)) {
                            setReportingId("");
                            onNotice("Thanks. The team will review this comment.");
                          }
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        {canComment ? (
          <View style={styles.commentComposer}>
            {replyTo ? (
              <View style={styles.replyingTo} testID="club-replying-to">
                <Text numberOfLines={1} style={styles.replyingToText}>Replying to {replyTo.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stop replying"
                  onPress={() => setReplyTo(null)}
                  hitSlop={8}
                >
                  <X size={16} color={equinaTheme.text.secondary} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.commentInputRow}>
              <TextInput
                testID="club-comment-input"
                accessibilityLabel={replyTo ? `Reply to ${replyTo.name}` : "Write a comment"}
                value={draft}
                onChangeText={setDraft}
                placeholder={replyTo ? `Reply to ${replyTo.name}` : "Add a comment"}
                placeholderTextColor={equinaTheme.text.tertiary}
                maxLength={commentLimit}
                multiline
                style={styles.commentInput}
              />
              <Pressable
                testID="club-comment-send"
                accessibilityRole="button"
                accessibilityLabel={replyTo ? "Send reply" : "Send comment"}
                accessibilityState={{ disabled: !draft.trim() || sending }}
                disabled={!draft.trim() || sending}
                onPress={() => void send()}
                style={styles.iconButton}
              >
                {sending
                  ? <ActivityIndicator size="small" color={equinaTheme.colors.brass} />
                  : <SendHorizontal size={20} color={draft.trim() ? equinaTheme.colors.brass : equinaTheme.text.tertiary} />}
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </EquinaSheet>
  );
}

/** Another rider as the Club shows them: a name, a photo, their groups and posts. */
function ProfileSheet({
  riderId,
  currentUserId,
  club,
  onDismiss,
  onNotice,
  onOpenPost,
  onOpenGroup
}: {
  riderId: string | null;
  currentUserId?: string;
  club: ClubController;
  onDismiss: () => void;
  onNotice: (message: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenGroup: (spaceId: string) => void;
}) {
  const [profile, setProfile] = useState<ClubRiderProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"profile" | "report" | "block">("profile");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!riderId) return;
    let active = true;
    setProfile(null);
    setLoading(true);
    setStep("profile");
    setWorking(false);
    void club.loadProfile(riderId).then((loaded) => {
      if (!active) return;
      setProfile(loaded);
      setLoading(false);
    });
    return () => { active = false; };
    // club.loadProfile is stable for the session.
  }, [riderId]);

  const run = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    try {
      await action();
    } finally {
      setWorking(false);
    }
  };

  const own = Boolean(riderId) && riderId === currentUserId;
  const name = profile?.displayName ?? "Rider";
  const groups = profile ? profileGroups(club.spaces, profile.spaceIds) : [];
  const spaceName = (spaceId: string) => club.spaces.find((space) => space.id === spaceId)?.name ?? "Club";
  const title = step === "report"
    ? "Why are you reporting this rider?"
    : step === "block"
      ? `Block ${name}?`
      : "Rider";

  return (
    <EquinaSheet visible={Boolean(riderId)} title={title} onDismiss={onDismiss} closeTestID="club-profile-close">
      <View style={styles.sheetBody} testID="club-profile">
        {loading ? <ActivityIndicator color={equinaTheme.colors.brass} /> : null}
        {!loading && !profile ? (
          <Text style={styles.noticeBody}>This rider is no longer in the Club.</Text>
        ) : null}
        {profile && step === "profile" ? (
          <>
            <View style={styles.profileHeader}>
              <Avatar name={name} uri={profile.avatarUrl} large />
              <View style={styles.profileHeading}>
                <Text accessibilityRole="header" numberOfLines={2} style={styles.profileName}>{name}</Text>
                {own ? <Text style={styles.meta}>This is how other riders see you in the Club.</Text> : null}
              </View>
            </View>
            {groups.length ? (
              <>
                <Text style={styles.sheetLabel}>Groups</Text>
                <View style={styles.chipsWrap}>
                  {groups.map((space) => (
                    <SpaceChip
                      key={space.id}
                      testID={`club-profile-group-${space.slug}`}
                      label={space.name}
                      selected={false}
                      onPress={() => onOpenGroup(space.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={styles.sheetLabel}>Recent posts</Text>
            {profile.posts.length === 0 ? (
              <Text style={styles.noticeBody}>{own ? "You have not posted yet." : `${name} has not posted yet.`}</Text>
            ) : (
              <ScrollView style={styles.profilePosts} contentContainerStyle={styles.commentListContent}>
                {profile.posts.map((entry) => (
                  <Pressable
                    key={entry.post.id}
                    testID={`club-profile-post-${entry.post.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${name}'s post in ${spaceName(entry.post.spaceId)}`}
                    onPress={() => onOpenPost(entry.post.id)}
                    style={({ pressed }) => [styles.profilePost, pressed && styles.pressed]}
                  >
                    <Text style={styles.meta}>{spaceName(entry.post.spaceId)} · {relativeTime(entry.post.createdAt)}</Text>
                    <Text numberOfLines={3} style={styles.body}>{entry.post.body}</Text>
                    <Text style={styles.meta}>
                      {entry.reactionCount} {entry.reactionCount === 1 ? "like" : "likes"} · {entry.commentCount} {entry.commentCount === 1 ? "comment" : "comments"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {!own ? (
              <View style={styles.profileActions}>
                <OptionRow Icon={Flag} label={`Report ${name}`} onPress={() => setStep("report")} />
                <OptionRow Icon={UserX} label={`Block ${name}`} destructive onPress={() => setStep("block")} />
              </View>
            ) : null}
          </>
        ) : null}
        {profile && step === "report" ? clubReportReasons.map((reason) => (
          <OptionRow
            key={reason.value}
            label={reason.label}
            disabled={working}
            onPress={() => void run(async () => {
              if (await club.report({ userId: profile.id }, reason.value)) {
                onNotice("Thanks. The team will review this rider.");
                onDismiss();
              }
            })}
          />
        )) : null}
        {profile && step === "block" ? (
          <>
            <Text style={styles.noticeBody}>
              You will not see each other's posts or comments in Club. They are not told you blocked them.
            </Text>
            <EquinaButton
              label={working ? "Blocking..." : `Block ${name}`}
              disabled={working}
              showArrow={false}
              onPress={() => void run(async () => {
                if (await club.block(profile.id)) {
                  onNotice(`${name} is blocked. You will not see each other in Club.`);
                  onDismiss();
                }
              })}
            />
          </>
        ) : null}
      </View>
    </EquinaSheet>
  );
}

/** Comments on the rider's posts, replies to their comments and likes. */
function ActivitySheet({
  visible,
  club,
  onDismiss,
  onOpenPost
}: {
  visible: boolean;
  club: ClubController;
  onDismiss: () => void;
  onOpenPost: (postId: string) => void;
}) {
  const [items, setItems] = useState<ClubActivityItem[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setItems(null);
    void club.loadActivity().then((loaded) => {
      if (!active) return;
      setItems(loaded ?? []);
      // Read once seen. The new ones keep their mark for this look.
      if (loaded?.some((entry) => !entry.read)) void club.markActivityRead();
    });
    return () => { active = false; };
    // club.loadActivity and markActivityRead are stable for the session.
  }, [visible]);

  return (
    <EquinaSheet visible={visible} title="Activity" onDismiss={onDismiss} closeTestID="club-activity-close">
      <View style={styles.sheetBody}>
        {items === null ? <ActivityIndicator color={equinaTheme.colors.brass} /> : null}
        {items?.length === 0 ? (
          <Text style={styles.noticeBody}>
            Nothing yet. When riders comment on your posts, answer your comments or like your posts, it shows here.
          </Text>
        ) : null}
        {items?.length ? (
          <ScrollView style={styles.commentList} contentContainerStyle={styles.commentListContent}>
            {items.map((entry) => (
              <Pressable
                key={entry.id}
                testID={`club-activity-${entry.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${entry.actor.displayName} ${activityVerb(entry.kind)}, ${relativeTime(entry.createdAt)}${entry.read ? "" : ", new"}`}
                onPress={() => onOpenPost(entry.postId)}
                style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}
              >
                <Avatar name={entry.actor.displayName} uri={entry.actor.avatarUrl} />
                <View style={styles.activityText}>
                  <Text style={styles.body}>
                    <Text style={styles.author}>{entry.actor.displayName}</Text> {activityVerb(entry.kind)}
                  </Text>
                  {entry.excerpt ? <Text numberOfLines={2} style={styles.noticeBody}>"{entry.excerpt}"</Text> : null}
                  <Text style={styles.meta}>{relativeTime(entry.createdAt)}</Text>
                </View>
                {!entry.read ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </EquinaSheet>
  );
}

function OptionsSheet({
  item,
  ownPost,
  onDismiss,
  onDelete,
  onReport,
  onBlock
}: {
  item: ClubFeedItem | null;
  ownPost: boolean;
  onDismiss: () => void;
  onDelete: () => Promise<void>;
  onReport: (reason: ClubReportReason) => Promise<void>;
  onBlock: () => Promise<void>;
}) {
  const [step, setStep] = useState<"menu" | "report" | "block" | "delete">("menu");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (item) {
      setStep("menu");
      setWorking(false);
    }
  }, [item]);

  const run = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    try {
      await action();
    } finally {
      setWorking(false);
    }
  };

  const name = item?.author.displayName ?? "this rider";
  const title = step === "report"
    ? "Why are you reporting this?"
    : step === "block"
      ? `Block ${name}?`
      : step === "delete"
        ? "Delete this post?"
        : "Post options";

  return (
    <EquinaSheet visible={Boolean(item)} title={title} onDismiss={onDismiss} closeTestID="club-options-close">
      <View style={styles.sheetBody}>
        {step === "menu" && ownPost ? (
          <OptionRow Icon={Trash2} label="Delete post" destructive onPress={() => setStep("delete")} />
        ) : null}
        {step === "menu" && !ownPost ? (
          <>
            <OptionRow Icon={Flag} label="Report post" onPress={() => setStep("report")} />
            <OptionRow Icon={UserX} label={`Block ${name}`} destructive onPress={() => setStep("block")} />
          </>
        ) : null}
        {step === "report" ? clubReportReasons.map((reason) => (
          <OptionRow
            key={reason.value}
            label={reason.label}
            disabled={working}
            onPress={() => void run(() => onReport(reason.value))}
          />
        )) : null}
        {step === "block" ? (
          <>
            <Text style={styles.noticeBody}>
              You will not see each other's posts or comments in Club. They are not told you blocked them.
            </Text>
            <EquinaButton
              label={working ? "Blocking..." : `Block ${name}`}
              disabled={working}
              showArrow={false}
              onPress={() => void run(onBlock)}
            />
          </>
        ) : null}
        {step === "delete" ? (
          <>
            <Text style={styles.noticeBody}>The post, its likes and its comments are removed for everyone.</Text>
            <EquinaButton
              label={working ? "Deleting..." : "Delete post"}
              disabled={working}
              showArrow={false}
              onPress={() => void run(onDelete)}
            />
          </>
        ) : null}
      </View>
    </EquinaSheet>
  );
}

function OptionRow({
  Icon,
  label,
  destructive = false,
  disabled = false,
  onPress
}: {
  Icon?: typeof Flag;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = destructive ? equinaTheme.colorRole.criticalOnDark : equinaTheme.text.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
    >
      {Icon ? <Icon size={18} color={color} /> : null}
      <Text style={[styles.optionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function SpaceChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Avatar({ name, uri, large = false }: { name: string; uri?: string; large?: boolean }) {
  const size = [styles.avatar, large && styles.avatarLarge];
  if (uri) return <Image source={{ uri }} style={size} accessibilityIgnoresInvertColors />;
  return (
    <View style={[...size, styles.avatarFallback]} accessible={false}>
      <Text style={[styles.avatarText, large && styles.avatarTextLarge]}>{name.trim().slice(0, 2).toUpperCase() || "R"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: equinaTheme.spacing.md,
    paddingBottom: equinaTheme.spacing.xl
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.sm
  },
  feedLabel: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    flex: 1
  },
  iconButton: {
    minWidth: equinaTheme.accessibility.minimumTapTarget,
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: {
    opacity: 0.72
  },
  composerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    padding: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  composerPrompt: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.secondary,
    flex: 1
  },
  chips: {
    gap: equinaTheme.spacing.sm,
    paddingRight: equinaTheme.spacing.md
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: equinaTheme.spacing.sm
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.pill,
    backgroundColor: equinaTheme.material.quiet,
    alignItems: "center",
    justifyContent: "center"
  },
  chipSelected: {
    backgroundColor: equinaTheme.material.selected
  },
  chipText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontWeight: "600"
  },
  chipTextSelected: {
    color: equinaTheme.colors.brass
  },
  errorBanner: {
    gap: 2,
    padding: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised
  },
  errorText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.colorRole.criticalOnDark
  },
  errorAction: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  loading: {
    marginTop: equinaTheme.spacing.lg
  },
  notice: {
    gap: equinaTheme.spacing.sm,
    padding: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised
  },
  noticeTitle: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  noticeBody: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  noticeAction: {
    alignSelf: "flex-start",
    marginTop: equinaTheme.spacing.xs
  },
  readOnlyNote: {
    paddingVertical: equinaTheme.spacing.sm,
    paddingHorizontal: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet
  },
  card: {
    gap: equinaTheme.spacing.compact,
    padding: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  cardHeading: {
    flex: 1,
    minWidth: 0
  },
  cardAuthor: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact
  },
  bellBadge: {
    position: "absolute",
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.colors.brass
  },
  bellBadgeText: {
    ...equinaTheme.typography.label,
    fontSize: 11,
    lineHeight: 14,
    color: equinaTheme.colors.ink,
    fontWeight: "700"
  },
  author: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  meta: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary,
    fontWeight: "400"
  },
  rideChip: {
    alignSelf: "flex-start",
    paddingHorizontal: equinaTheme.spacing.sm,
    paddingVertical: 2,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: equinaTheme.material.selected
  },
  rideChipText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  body: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  actions: {
    flexDirection: "row",
    gap: equinaTheme.spacing.md
  },
  action: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    minWidth: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  actionText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  actionTextActive: {
    color: equinaTheme.colors.brass
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 20
  },
  avatarTextLarge: {
    ...equinaTheme.typography.body,
    fontWeight: "600"
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.md
  },
  profileHeading: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  profileName: {
    ...equinaTheme.typography.body,
    fontSize: 20,
    lineHeight: 26,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  profilePosts: {
    maxHeight: 280
  },
  profilePost: {
    gap: 4,
    padding: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.raised
  },
  profileActions: {
    gap: 2
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: equinaTheme.spacing.compact,
    paddingVertical: equinaTheme.spacing.xs
  },
  activityText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  unreadDot: {
    width: 8,
    height: 8,
    marginTop: 8,
    borderRadius: 4,
    backgroundColor: equinaTheme.colors.brass
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.surfaces.elevated
  },
  avatarText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass
  },
  sheetBody: {
    gap: equinaTheme.spacing.compact
  },
  sheetLabel: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.secondary
  },
  composerInput: {
    ...equinaTheme.typography.body,
    minHeight: 120,
    maxHeight: 220,
    padding: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet,
    color: equinaTheme.text.primary,
    textAlignVertical: "top"
  },
  rideToggle: {
    gap: 2,
    padding: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  rideToggleOn: {
    borderColor: equinaTheme.colors.brass,
    backgroundColor: equinaTheme.material.fieldFocused
  },
  rideToggleTitle: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  rideToggleBody: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary
  },
  attachRow: {
    minHeight: equinaTheme.accessibility.minimumTapTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm,
    paddingHorizontal: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  attachText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.primary,
    fontWeight: "600"
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    padding: equinaTheme.spacing.sm,
    borderRadius: equinaTheme.radius.control,
    borderWidth: 1,
    borderColor: equinaTheme.colors.brass,
    backgroundColor: equinaTheme.material.fieldFocused
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  photoName: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    flex: 1,
    minWidth: 0
  },
  groupCard: {
    gap: equinaTheme.spacing.compact,
    padding: equinaTheme.spacing.compact,
    borderRadius: equinaTheme.radius.card,
    backgroundColor: equinaTheme.surfaces.raised,
    borderWidth: 1,
    borderColor: equinaTheme.material.separator
  },
  groupBody: {
    gap: equinaTheme.spacing.compact
  },
  groupImage: {
    width: "100%",
    height: 132,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  groupHeaderImage: {
    width: "100%",
    height: 96,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.surfaces.elevated
  },
  groupText: {
    gap: 4,
    paddingHorizontal: equinaTheme.spacing.xs
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  groupName: {
    ...equinaTheme.typography.body,
    color: equinaTheme.text.primary,
    fontWeight: "600",
    flexShrink: 1
  },
  groupJoined: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    paddingHorizontal: equinaTheme.spacing.sm,
    paddingVertical: 2,
    borderRadius: equinaTheme.radius.compact,
    backgroundColor: equinaTheme.material.selected
  },
  groupAction: {
    alignSelf: "flex-start",
    minHeight: 40,
    minWidth: 96,
    paddingHorizontal: equinaTheme.spacing.md,
    borderRadius: equinaTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: equinaTheme.material.quiet
  },
  groupActionJoin: {
    backgroundColor: equinaTheme.colors.brass
  },
  groupActionText: {
    ...equinaTheme.typography.meta,
    color: equinaTheme.text.secondary,
    fontWeight: "600"
  },
  groupActionJoinText: {
    color: equinaTheme.colors.ink
  },
  commentList: {
    maxHeight: 340
  },
  commentListContent: {
    gap: equinaTheme.spacing.compact
  },
  comment: {
    gap: 4,
    paddingBottom: equinaTheme.spacing.compact,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: equinaTheme.spacing.sm
  },
  commentReply: {
    marginLeft: equinaTheme.spacing.md,
    paddingLeft: equinaTheme.spacing.compact,
    borderLeftWidth: 2,
    borderLeftColor: equinaTheme.material.separator
  },
  commentActions: {
    flexDirection: "row",
    gap: equinaTheme.spacing.md
  },
  commentPost: {
    gap: 2,
    paddingBottom: equinaTheme.spacing.compact,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: equinaTheme.material.separator
  },
  commentComposer: {
    gap: equinaTheme.spacing.xs
  },
  replyingTo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: equinaTheme.spacing.sm,
    paddingHorizontal: equinaTheme.spacing.compact,
    paddingVertical: 6,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.selected
  },
  replyingToText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.colors.brass,
    flexShrink: 1
  },
  commentAction: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center"
  },
  commentActionText: {
    ...equinaTheme.typography.label,
    color: equinaTheme.text.tertiary
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.sm
  },
  commentInput: {
    ...equinaTheme.typography.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: equinaTheme.spacing.compact,
    paddingVertical: equinaTheme.spacing.sm,
    borderRadius: equinaTheme.radius.control,
    backgroundColor: equinaTheme.material.quiet,
    color: equinaTheme.text.primary
  },
  optionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: equinaTheme.spacing.compact,
    paddingHorizontal: equinaTheme.spacing.sm,
    borderRadius: equinaTheme.radius.control
  },
  optionText: {
    ...equinaTheme.typography.body
  }
});
