import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { secondaryClass } from './PlansWorkspace';

export default function PlanPhotoAlbum({ id, summary }: { id: string; summary: plans.PhotoSummary }) {
  const client = useQueryClient();
  const key = ['plans', 'photos', id];
  const album = useQuery({
    queryKey: key,
    queryFn: () => plans.album(id),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: (q) => (q.state.data ? Math.max(1000, (q.state.data.expires_in - 15) * 1000) : false),
  });
  const [selected, setSelected] = useState('');
  const write = useMutation({
    mutationFn: async (change: File[] | string) => {
      if (typeof change === 'string') {
        client.setQueryData(key, await plans.removePhoto(id, change));
        setSelected('');
      } else {
        for (const file of change) client.setQueryData(key, await plans.addPhoto(id, file));
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  const grid = album.isError ? undefined : album.data;
  const photo = grid?.photos.find((item) => item.id === selected);
  return (
    <section className="space-y-3 rounded-xl border border-app p-4">
      <h3 className="font-semibold">Photos</h3>
      <p className="text-sm">{grid?.text ?? summary.text}</p>
      {album.isError && (
        <button className={secondaryClass} onClick={() => void album.refetch()}>
          Retry photos
        </button>
      )}
      <div className="grid grid-cols-4 gap-2">
        {grid?.photos.map((item) => (
          <button
            type="button"
            key={item.id}
            className="overflow-hidden rounded-lg"
            aria-label={'Open photo from ' + item.by_name}
            onClick={() => {
              setSelected(item.id);
              void album.refetch();
            }}
          >
            {item.thumb_url && (
              <img
                src={item.thumb_url}
                alt={'Photo from ' + item.by_name}
                referrerPolicy="no-referrer"
                className="aspect-square w-full object-cover"
              />
            )}
          </button>
        ))}
      </div>
      {photo && (
        <div className="space-y-2">
          {photo.url && (
            <img
              src={photo.url}
              alt={'Photo from ' + photo.by_name}
              referrerPolicy="no-referrer"
              className="max-h-[60vh] w-full object-contain"
            />
          )}
          <button className={secondaryClass} onClick={() => setSelected('')}>
            Close photo
          </button>
          {photo.can_remove && (
            <button
              className={secondaryClass}
              disabled={write.isPending}
              onClick={() => {
                if (window.confirm('Remove this photo from the plan?')) write.mutate(photo.id);
              }}
            >
              Remove photo
            </button>
          )}
        </div>
      )}
      {grid?.can_add && (
        <label className="block text-sm font-medium">
          Add yours
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            multiple
            className="block w-full py-2"
            disabled={write.isPending}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length) write.mutate(files);
            }}
          />
        </label>
      )}
      {write.isPending && <p role="status">Updating photos…</p>}
      {write.isError && <p role="alert">{write.error.message}</p>}
      <p className="text-sm text-app-muted">{summary.note}</p>
    </section>
  );
}
