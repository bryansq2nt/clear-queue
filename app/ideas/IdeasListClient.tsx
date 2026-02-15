'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

interface Idea {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export default function IdeasListClient({
  initialIdeas,
}: {
  initialIdeas: Idea[];
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIdeas = initialIdeas.filter((idea) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      idea.title?.toLowerCase().includes(query) ||
      idea.description?.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      {/* Search Input */}
      <div className="mb-4">
        <Input
          type="text"
          placeholder="Search ideas by title or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Ideas List */}
      {filteredIdeas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery ? 'No ideas match your search.' : 'No ideas yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIdeas.map((idea) => (
            <Link
              key={idea.id}
              href={`/ideas/${idea.id}`}
              className="block bg-white rounded-lg border p-4 hover:border-primary transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">{idea.title}</h3>
              {idea.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {idea.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {new Date(idea.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
