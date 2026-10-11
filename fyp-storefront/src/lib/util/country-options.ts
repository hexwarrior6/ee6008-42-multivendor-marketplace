export type CountryOption = { country: string; region: string; label: string }

type Region = {
  id: string
  countries?: { iso_2?: string; display_name?: string; name?: string }[]
}

export function getCountryOptions(regions: Region[]): CountryOption[] {
  return regions.flatMap(region => (region.countries ?? []).flatMap(country => {
    const code = country.iso_2?.trim().toLowerCase()
    if (!code) return []
    return [{
      country: code,
      region: region.id,
      label: country.display_name || country.name || code.toUpperCase(),
    }]
  })).sort((a, b) => a.label.localeCompare(b.label))
}
