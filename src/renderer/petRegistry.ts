export interface PetRegistryEntry {
  name: string;
  displayName: string;
  manifest: string;
}

interface PetListFile {
  default?: string;
  pets?: Array<{
    name?: string;
    displayName?: string;
    manifest?: string;
  }>;
}

const fallbackPets: PetRegistryEntry[] = [
  { name: "koda", displayName: "Koda", manifest: "/pets/koda/pet.json" },
];

export class PetRegistry {
  private readonly petsByName: Map<string, PetRegistryEntry>;
  readonly defaultPet: PetRegistryEntry;

  constructor(pets: PetRegistryEntry[], defaultName?: string) {
    const safePets = pets.length > 0 ? pets : fallbackPets;
    this.petsByName = new Map(safePets.map((pet) => [pet.name, pet]));
    this.defaultPet = this.petsByName.get(defaultName ?? "") ?? safePets[0];
  }

  get pets(): PetRegistryEntry[] {
    return Array.from(this.petsByName.values());
  }

  has(name: string): boolean {
    return this.petsByName.has(name);
  }

  get(name: string): PetRegistryEntry | undefined {
    return this.petsByName.get(name);
  }

  resolve(name: string | null | undefined): PetRegistryEntry {
    return name ? this.get(name) ?? this.defaultPet : this.defaultPet;
  }
}

export async function loadPetRegistry(): Promise<PetRegistry> {
  try {
    const response = await fetch("/pets/pets.json");

    if (!response.ok) {
      throw new Error(`pet list request failed: ${response.status} ${response.statusText}`);
    }

    const petList = normalizePetList((await response.json()) as PetListFile);
    return new PetRegistry(petList.pets, petList.defaultName);
  } catch (error) {
    console.error("[koda-desk] failed to load pet registry, using fallback", error);
    return new PetRegistry(fallbackPets, fallbackPets[0].name);
  }
}

function normalizePetList(value: PetListFile): { defaultName?: string; pets: PetRegistryEntry[] } {
  const pets = Array.isArray(value.pets)
    ? value.pets
        .filter((entry): entry is Required<Pick<PetRegistryEntry, "name" | "manifest">> & { displayName?: string } => {
          return typeof entry.name === "string" && entry.name.length > 0 && typeof entry.manifest === "string";
        })
        .map((entry) => ({
          name: entry.name,
          displayName: typeof entry.displayName === "string" && entry.displayName.length > 0
            ? entry.displayName
            : entry.name,
          manifest: entry.manifest,
        }))
    : [];

  return {
    defaultName: typeof value.default === "string" ? value.default : undefined,
    pets,
  };
}
