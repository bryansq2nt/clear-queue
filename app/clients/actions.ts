'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type Client = Database['public']['Tables']['clients']['Row'];

export const getClients = cache(async (search?: string): Promise<Client[]> => {
  await requireAuth();
  const supabase = await createClient();

  const clientCols =
    'id, owner_id, full_name, phone, email, gender, address_line1, address_line2, city, state, postal_code, preferences, notes, created_at, updated_at';
  let query = supabase
    .from('clients')
    .select(clientCols)
    .order('full_name', { ascending: true });

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.ilike('full_name', term);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching clients:', error);
    return [];
  }

  return (data as Client[]) || [];
});

export async function getClientById(id: string): Promise<Client | null> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, owner_id, full_name, phone, email, gender, address_line1, address_line2, city, state, postal_code, preferences, notes, created_at, updated_at'
    )
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Client;
}

export async function getProjectsByClientId(clientId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color, category')
    .eq('client_id', clientId)
    .order('name', { ascending: true });
  if (error) return [];
  return (data || []) as {
    id: string;
    name: string;
    color: string | null;
    category: string;
  }[];
}

export async function getProjectsByBusinessId(businessId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color, category')
    .eq('business_id', businessId)
    .order('name', { ascending: true });
  if (error) return [];
  return (data || []) as {
    id: string;
    name: string;
    color: string | null;
    category: string;
  }[];
}

export async function getProjectsWithoutClient() {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color, category')
    .is('client_id', null)
    .order('name', { ascending: true });
  if (error) return [];
  return (data || []) as {
    id: string;
    name: string;
    color: string | null;
    category: string;
  }[];
}

export async function createClientAction(
  formData: FormData
): Promise<{ error?: string; data?: Client }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const full_name = (formData.get('full_name') as string)?.trim();
  if (!full_name) return { error: 'Full name is required' };

  const insertPayload: Database['public']['Tables']['clients']['Insert'] = {
    owner_id: user.id,
    full_name,
    phone: (formData.get('phone') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
    gender: (formData.get('gender') as string)?.trim() || null,
    address_line1: (formData.get('address_line1') as string)?.trim() || null,
    address_line2: (formData.get('address_line2') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    state: (formData.get('state') as string)?.trim() || null,
    postal_code: (formData.get('postal_code') as string)?.trim() || null,
    preferences: (formData.get('preferences') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
  };
  const { data, error } = await supabase
    .from('clients')
    .insert(insertPayload as never)
    .select()
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'createClientAction',
      userIntent: 'Crear cliente',
      expected: 'El cliente se crea y aparece en la lista',
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  return { data: data as Client };
}

export async function updateClientAction(
  id: string,
  formData: FormData
): Promise<{ error?: string; data?: Client }> {
  await requireAuth();
  const supabase = await createClient();

  const full_name = (formData.get('full_name') as string)?.trim();
  if (!full_name) return { error: 'Full name is required' };

  const updatePayload: Database['public']['Tables']['clients']['Update'] = {
    full_name,
    phone: (formData.get('phone') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
    gender: (formData.get('gender') as string)?.trim() || null,
    address_line1: (formData.get('address_line1') as string)?.trim() || null,
    address_line2: (formData.get('address_line2') as string)?.trim() || null,
    city: (formData.get('city') as string)?.trim() || null,
    state: (formData.get('state') as string)?.trim() || null,
    postal_code: (formData.get('postal_code') as string)?.trim() || null,
    preferences: (formData.get('preferences') as string)?.trim() || null,
    notes: (formData.get('notes') as string)?.trim() || null,
  };
  const { data, error } = await supabase
    .from('clients')
    .update(updatePayload as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'updateClientAction',
      userIntent: 'Actualizar datos del cliente',
      expected: 'Los cambios se guardan',
      extra: { clientId: id },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  return { data: data as Client };
}

export async function deleteClientAction(
  id: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from('clients').delete().eq('id', id);

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'deleteClientAction',
      userIntent: 'Eliminar cliente',
      expected: 'El cliente se elimina',
      extra: { clientId: id },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  return {};
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

type Business = Database['public']['Tables']['businesses']['Row'];

export type SocialLinks = {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
};

/** All businesses for the current user, with client name (for list view). */
export type BusinessWithClient = Business & { client_name: string | null };

export const getBusinesses = cache(
  async (search?: string): Promise<BusinessWithClient[]> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const businessCols =
      'id, owner_id, client_id, name, tagline, description, email, address_line1, address_line2, city, state, postal_code, website, social_links, notes, created_at, updated_at';
    let query = supabase
      .from('businesses')
      .select(businessCols)
      .eq('owner_id', user.id)
      .order('name', { ascending: true });
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},tagline.ilike.${term}`);
    }
    const { data: businessList, error } = await query;
    if (error || !businessList?.length)
      return (businessList as BusinessWithClient[]) || [];
    const clientIds = [
      ...new Set((businessList as Business[]).map((b) => b.client_id)),
    ];
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, full_name')
      .in('id', clientIds);
    const clientsList = (clientsData || []) as {
      id: string;
      full_name: string;
    }[];
    const nameByClientId = clientsList.reduce(
      (acc, c) => {
        acc[c.id] = c.full_name;
        return acc;
      },
      {} as Record<string, string>
    );
    return (businessList as Business[]).map((b) => ({
      ...b,
      client_name: nameByClientId[b.client_id] ?? null,
    })) as BusinessWithClient[];
  }
);

export async function getBusinessesByClientId(
  clientId: string
): Promise<Business[]> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, owner_id, client_id, name, tagline, description, email, address_line1, address_line2, city, state, postal_code, website, social_links, notes, created_at, updated_at'
    )
    .eq('client_id', clientId)
    .order('name', { ascending: true });
  if (error) return [];
  return (data as Business[]) || [];
}

export async function getBusinessById(id: string): Promise<Business | null> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, owner_id, client_id, name, tagline, description, email, address_line1, address_line2, city, state, postal_code, website, social_links, notes, created_at, updated_at'
    )
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data as Business;
}

function parseSocialLinks(formData: FormData): Record<string, string> {
  const links: Record<string, string> = {};
  const keys = ['instagram', 'facebook', 'tiktok', 'youtube'] as const;
  keys.forEach((k) => {
    const v = (formData.get(`social_${k}`) as string)?.trim();
    if (v) links[k] = v;
  });
  return links;
}

export async function createBusinessAction(
  clientId: string,
  formData: FormData
): Promise<{ error?: string; data?: Business }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Business name is required' };

  const email = (formData.get('email') as string)?.trim() || null;
  const social_links = parseSocialLinks(formData);

  const businessInsertPayload: Database['public']['Tables']['businesses']['Insert'] =
    {
      owner_id: user.id,
      client_id: clientId,
      name,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      description: (formData.get('description') as string)?.trim() || null,
      email,
      address_line1: (formData.get('address_line1') as string)?.trim() || null,
      address_line2: (formData.get('address_line2') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      postal_code: (formData.get('postal_code') as string)?.trim() || null,
      website: (formData.get('website') as string)?.trim() || null,
      social_links: Object.keys(social_links).length ? social_links : {},
      notes: (formData.get('notes') as string)?.trim() || null,
    };
  const { data, error } = await supabase
    .from('businesses')
    .insert(businessInsertPayload as never)
    .select()
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'createBusinessAction',
      userIntent: 'Crear negocio',
      expected: 'El negocio se crea bajo el cliente',
      extra: { clientId },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  return { data: data as Business };
}

export async function updateBusinessAction(
  id: string,
  formData: FormData
): Promise<{ error?: string; data?: Business }> {
  await requireAuth();
  const supabase = await createClient();

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Business name is required' };

  const email = (formData.get('email') as string)?.trim() || null;
  const social_links = parseSocialLinks(formData);

  const businessUpdatePayload: Database['public']['Tables']['businesses']['Update'] =
    {
      name,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      description: (formData.get('description') as string)?.trim() || null,
      email,
      address_line1: (formData.get('address_line1') as string)?.trim() || null,
      address_line2: (formData.get('address_line2') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      postal_code: (formData.get('postal_code') as string)?.trim() || null,
      website: (formData.get('website') as string)?.trim() || null,
      social_links: Object.keys(social_links).length ? social_links : {},
      notes: (formData.get('notes') as string)?.trim() || null,
    };
  const { data, error } = await supabase
    .from('businesses')
    .update(businessUpdatePayload as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'updateBusinessAction',
      userIntent: 'Actualizar negocio',
      expected: 'Los cambios se guardan',
      extra: { businessId: id },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  return { data: data as Business };
}

type BusinessUpdateFields = Partial<
  Database['public']['Tables']['businesses']['Update']
>;

/** Update only the provided business fields (for in-place editing). */
export async function updateBusinessFieldsAction(
  id: string,
  fields: BusinessUpdateFields
): Promise<{ error?: string; data?: Business }> {
  await requireAuth();
  const supabase = await createClient();
  const payload: Record<string, unknown> = { ...fields };
  if (payload.name !== undefined && (payload.name as string)?.trim() === '') {
    return { error: 'Business name is required' };
  }
  if (payload.name !== undefined)
    payload.name = (payload.name as string)?.trim() ?? null;
  if (payload.tagline !== undefined)
    payload.tagline = (payload.tagline as string)?.trim() || null;
  if (payload.description !== undefined)
    payload.description = (payload.description as string)?.trim() || null;
  if (payload.email !== undefined)
    payload.email = (payload.email as string)?.trim() || null;
  if (payload.website !== undefined)
    payload.website = (payload.website as string)?.trim() || null;
  if (payload.address_line1 !== undefined)
    payload.address_line1 = (payload.address_line1 as string)?.trim() || null;
  if (payload.address_line2 !== undefined)
    payload.address_line2 = (payload.address_line2 as string)?.trim() || null;
  if (payload.city !== undefined)
    payload.city = (payload.city as string)?.trim() || null;
  if (payload.state !== undefined)
    payload.state = (payload.state as string)?.trim() || null;
  if (payload.postal_code !== undefined)
    payload.postal_code = (payload.postal_code as string)?.trim() || null;
  if (payload.notes !== undefined)
    payload.notes = (payload.notes as string)?.trim() || null;
  const { data, error } = await supabase
    .from('businesses')
    .update(payload as never)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'updateBusinessFieldsAction',
      userIntent: 'Actualizar campos del negocio',
      expected: 'Los cambios se guardan',
      extra: { businessId: id },
    });
    return { error: error.message };
  }
  // Ownership: the business owns its projects. When the business's client changes,
  // cascade client_id to all projects linked to this business.
  if (payload.client_id !== undefined) {
    const newClientId = (payload.client_id as string)?.trim() || null;
    await supabase
      .from('projects')
      .update({ client_id: newClientId } as never)
      .eq('business_id', id);
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  revalidatePath('/businesses');
  revalidatePath(`/businesses/${id}`);
  return { data: data as Business };
}

export async function deleteBusinessAction(
  id: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.from('businesses').delete().eq('id', id);
  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'deleteBusinessAction',
      userIntent: 'Eliminar negocio',
      expected: 'El negocio se elimina',
      extra: { businessId: id },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  return {};
}

// ---------------------------------------------------------------------------
// Client links
// ---------------------------------------------------------------------------

type ClientLink = Database['public']['Tables']['client_links']['Row'];

export async function getClientLinks(clientId: string): Promise<ClientLink[]> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_links')
    .select('id, client_id, url, label, sort_order, created_at')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data as ClientLink[]) || [];
}

export async function createClientLinkAction(
  clientId: string,
  formData: FormData
): Promise<{ error?: string; data?: ClientLink }> {
  await requireAuth();
  const supabase = await createClient();

  const url = (formData.get('url') as string)?.trim();
  if (!url) return { error: 'URL is required' };

  const linkInsertPayload: Database['public']['Tables']['client_links']['Insert'] =
    {
      client_id: clientId,
      url,
      label: (formData.get('label') as string)?.trim() || null,
      sort_order: 0,
    };
  const { data, error } = await supabase
    .from('client_links')
    .insert(linkInsertPayload as never)
    .select()
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'createClientLinkAction',
      userIntent: 'Añadir enlace al cliente',
      expected: 'El enlace se guarda',
      extra: { clientId },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  return { data: data as ClientLink };
}

export async function updateClientLinkAction(
  id: string,
  formData: FormData
): Promise<{ error?: string; data?: ClientLink }> {
  await requireAuth();
  const supabase = await createClient();

  const url = (formData.get('url') as string)?.trim();
  if (!url) return { error: 'URL is required' };

  const linkUpdatePayload: Database['public']['Tables']['client_links']['Update'] =
    {
      url,
      label: (formData.get('label') as string)?.trim() || null,
    };
  const { data, error } = await supabase
    .from('client_links')
    .update(linkUpdatePayload as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'updateClientLinkAction',
      userIntent: 'Actualizar enlace del cliente',
      expected: 'Los cambios se guardan',
      extra: { linkId: id },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  return { data: data as ClientLink };
}

export async function deleteClientLinkAction(
  id: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.from('client_links').delete().eq('id', id);
  if (error) {
    captureWithContext(error, {
      module: 'clients',
      action: 'deleteClientLinkAction',
      userIntent: 'Eliminar enlace del cliente',
      expected: 'El enlace se elimina',
      extra: { linkId: id },
    });
    return { error: error.message };
  }
  revalidatePath('/clients');
  revalidatePath('/clients/[id]');
  return {};
}
