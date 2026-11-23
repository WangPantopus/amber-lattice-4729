# Every county: where its home facts come from, and the route for what's missing

November 15, 2026 (UTC). Research for the founder, who asked for new directions before more building: "think out of box
... find ways to get the property details data from those counties that we were struggling with, so that we can cover the
whole nation's users and do not pay anyone". Nothing here is built, bought, sent or switched. It consolidates every
county's source and route in one table ([evidence/national-routes-by-county.csv](evidence/national-routes-by-county.csv),
3,222 counties) and reports what a new kind of search found. Counts only: no addresses or owner names. This isn't
legal advice. Terms are as read on the date shown, and every layer named here still needs its terms read in full
before any use.

Related: [statewide-inventory.md](statewide-inventory.md), [other-routes.md](other-routes.md),
[fill-routes.md](fill-routes.md), [lookup-sites.md](lookup-sites.md), [full-page-plan.md](full-page-plan.md),
[cost-and-rights.md](cost-and-rights.md), [decisions.md](decisions.md).

> **Snapshot of November 15, 2026.** Counts and rulings here are as of that day. Current state (live counties, lanes, what's
> left) is kept in the coordinator's private hand-off notes, not in Git. Publisher names that are individual catalog accounts
> are shown as "(catalog account)"; each layer's public address identifies its office.

## The answer

- **Read this first: the sweep's counts are candidates, and most didn't survive a full read.** The sweep graded layers
  on bedrooms and baths only. On November 15 three builders read every layer's terms and all six facts
  (section 11). About 451,000 houses were buildable (14 counties and cities), and about 308,000 more wait on three
  founder decisions. The rest failed on another fact, were one-time copies, or carried limiting terms, and became
  letters.
- **Where we are.** 144 counties are live: 27.1M of 145.4M homes (19%).
  54.5M more are stored but short of the bar, nearly all for lack of bedrooms and baths. 63.8M
  have no county file at all.
- **The search so far went county by county,** to each assessor's files and to statewide files, with a catalog search
  by county name for 209 of them. Nobody had searched the whole country at once, by column, for other government
  offices that publish the same record: a county's mapping department, a city, a regional planning agency, a utility
  authority. The founder allowed such copies on November 8, under conditions (section 3).
- **Looking there finds a lot.** A sweep of the two national open-data catalogs, column by column, found a
  government-published layer with bedrooms and baths on most homes in 60 counties that
  aren't live (5.9M homes): 39 with no county file today (3.28M) and 21 stored
  without bedrooms (2.65M). 54 more counties (6.7M homes) have
  a layer that covers part of the county, usually one city. Several are counties whose letters were never sent:
  Sedgwick County KS, Fulton County GA and, with the limits noted in 3.2, Lee County FL and Utah County UT.
- **Indiana was misread.** The state's building files hold bedrooms, full baths and half baths for all 92 counties
  (the earlier note said they didn't). One email reaches 2.98M homes with all six facts, if counties
  fill what the rule requires.
- **Some assessors keep no bedroom count at all.** Maricopa County and Maryland are confirmed; Tennessee's state system
  and other Arizona counties are likely. Under today's bar those homes can never go live, whatever we find. That needs
  the founder's decision.
- **The largest single step is still unsent mail.** No letter has gone out. King County needs one click, Indiana one
  email, Maricopa one signed form.
- **Nothing found replaces the household.** About 25.3M homes sit in 1,656 mostly small
  counties where no office publishes a file. A way for a household to hand us its own county page closes that for
  anyone who signs up.

## 1. What was checked today

Read on November 15, 2026 (04:30-05:20 UTC), with the reader key, the GitHub CLI and the state's server.

- **Production switch file:** written 23:54:31 UTC November 14; 144 counties live.
- **Storage:** 955 counties in 36 states have a published release.
- **Landing queue:** nothing waiting. The last seven queued PRs (#4088-#4092, #4098, #4099) are merged.
- **CI:** master green at 55f0495e0d; the backend released to production at 00:46 UTC November 15.
- **Index runs:** none in flight.
- **New York's parcel service:** still down ("Service ... not started").

## 2. The gap, sized

Homes are Census housing units per county ([evidence/registry-coverage.csv](evidence/registry-coverage.csv)); Puerto
Rico is included, which is why the total is 145.4M and not the 143.8M in the hand-off.

| | Counties | Homes | Share |
|---|---:|---:|---:|
| Live: the six facts on 90% of houses | 144 | 27.1M | 19% |
| Stored, short of the bar | 811 | 54.5M | 37% |
| No county file | 2,267 | 63.8M | 44% |

The stored counties split by what their houses hold: year and size but no bedrooms 15.4M homes; year only 17.0M;
address and value only 9.8M; bedrooms on part of the county 6.6M; few homes typed as houses 4.4M (Wisconsin); near the
bar 1.3M.

## 3. New direction 1: other offices that publish the assessor's record

An assessor's site may sell its file, refuse scripts or publish only a lookup page, while the same county's mapping
department, a city inside it or a regional agency posts the parcel layer with the assessor's columns attached, for
planning, permits or emergency response. The record is still the county's. The publisher and its terms are different.

**The rule already in force** (the founder, November 8, after Clark County NV): a city's or region's free public copy
of a county's records may be used, even when the county sells its own file, if the copy is open with no login, neither
the copy's terms nor the county's own terms forbid reuse or redistribution, nothing gets around a block, and owner
columns are never read. The source line names the county office as the origin and the city or region as the copy's
publisher. So a layer in the tables below is a candidate, not a cleared source: the origin office's terms count too.

**How the sweep worked.** ArcGIS Hub's public index lists every layer's column names. Twenty-one searches (parcels,
assessor, CAMA, dwelling, tax roll and so on) read about 200,000 catalog entries and kept the layers with a bedroom
column and a bath or year-built column. Each kept layer in a county that isn't live was then asked for counts only: its
rows, and how many have bedrooms, baths and a year built. Its publisher, last edit date and posted terms were read from
the catalog. No record was fetched and no county lookup page was opened. Socrata's catalog was searched the same way.

**How to read the tables.** "Homes" is the county's housing units, apartments included, so a layer with bedrooms on
60-80% of that number usually covers nearly every house. "Terms seen" is what the catalog entry posts, not a full
rights read. Layers were matched to a county by their map extent and the publisher's name; a builder confirms each.
Publisher names are as the catalog shows them, and some are a staff account.

### 3.1 Counties with no county file today (39 counties, 3.28M homes, plus those marked "limits")


| County | Homes | Published by | Layer | Records | Bedrooms | Baths | Year built | Last edit | Terms seen |
|---|---:|---|---|---:|---:|---:|---:|---|---|
| Fulton County, GA | 507,119 | City of Atlanta - Department of City Plannin | Tax StructureResidential$ | 308,345 | 305,738 | 306,847 | 308,345 | 2025-03 | none posted |
| Fairfax County, VA | 430,047 | County of Fairfax | Tax Administration's Real Estate - Dwell | 340,666 | 333,110 | 339,311 | 340,653 | 2026-09 | limits: internal |
| Lake County, IL | 270,618 | Lake County Fire Chiefs Association | Tax Parcel Information | 279,208 | 149,815 | 218,426 | 218,470 | 2022-02 | none posted |
| Greenville County, SC | 238,260 | (catalog account) | Tax Parcel | 244,748 | 173,160 | 177,270 | 0 | 2025-08 | none posted |
| Sedgwick County, KS | 227,638 | City of Wichita GIS | Parcels | 241,705 | 174,820 | 174,818 | 187,299 | 2026-06 | none posted |
| Lucas County, OH | 200,998 | Lucas County Auditor | Lucas Parcels CAMA | 191,371 | 141,175 | 141,155 | 141,209 | 2026-11 | disclaimer only |
| Spartanburg County, SC | 144,170 | Spartanburg County Online | CAMA Parcels | 183,465 | 122,500 | 123,646 | 130,866 | 2026-10 | none posted |
| Greene County, MO | 138,982 | City of Springfield, Missouri | County Parcels | 121,853 | 99,442 | 99,401 | 99,534 | 2024-05 | none posted |
| Lorain County, OH | 136,548 | Lorain County Auditor GIS | Property Class Codes | 170,440 | 112,713 | 112,848 | 112,697 | 2025-01 | none posted |
| Lexington County, SC | 132,916 | City of West Columbia | Parcels | 147,081 | 102,219 | 102,219 | 102,313 | 2023-09 | none posted |
| Northampton County, PA | 129,448 | BTMA On-Line GIS | Parcels | 123,357 | 101,826 | 101,592 | 0 | 2022-12 | none posted |
| Marin County, CA | 112,116 | Marin County - Geographic Information | BaseMap secured | 96,226 | 79,747 | 79,779 | 0 | 2022-03 | none posted |
| El Dorado County, CA | 94,653 | (catalog account) | Parcel Master 20240430 | 64,736 | 44,136 | 54,592 | 48,602 | 2025-04 | disclaimer only |
| Butte County, CA | 92,813 | (catalog account) | Butte County Parcels 2025 | 95,881 | 61,344 | 61,748 | 78,377 | 2025-02 | disclaimer only |
| Peoria County, IL | 84,930 | Tri-County Regional Planning Commission | Tax Parcels  | 90,166 | 64,647 | 65,347 | 65,425 | 2025-01 | none posted |
| Medina County, OH | 76,202 | Medina County | Medina Sales | 166,000 | 146,707 | 146,734 | 147,000 | 2023-06 | none posted |
| Nevada County, CA | 54,309 | County of Nevada | Parcel Information | 64,402 | 42,438 | 42,659 | 44,577 | 2024-04 | CC-BY-4.0 |
| Comanche County, OK | 52,666 | City of Lawton GIS Division | Assessor data 20221102 | 48,572 | 41,401 | 41,747 | 42,501 | 2026-09 | none posted |
| Kings County, CA | 46,986 | (catalog account) | Kings County Parcel | 52,703 | 33,074 | 33,436 | 36,677 | 2026-10 | none posted |
| Wayne County, OH | 46,954 | Wayne County, Ohio - GIS | Parcel Dwelling Parcels | 57,781 | 37,333 | 36,955 | 37,358 | 2026-07 | none posted |
| Burleigh County, ND | 43,779 | City of Bismarck, ND | Public Parcels | 27,636 | 21,803 | 21,965 | 25,181 | 2026-11 | none posted |
| Yamhill County, OR | 41,200 | Yamhill County | Taxlot Parcels | 43,153 | 29,581 | 29,298 | 29,911 | 2026-11 | none posted |
| Benton County, OR | 40,951 | Corvallis Maps Online | Benton County Tax Lots | 41,557 | 25,866 | 28,025 | 13,029 | 2025-08 | none posted |
| Klamath County, OR | 33,162 | Klamath County GIS Department | KC Taxlots | 61,230 | 23,278 | 24,690 | 27,625 | 2026-11 | disclaimer only |
| Greenwood County, SC | 31,702 | (catalog account) | Gwd TaxParcel | 39,067 | 19,154 | 19,486 | 25,998 | 2025-07 | none posted |
| Creek County, OK | 31,629 | Creek County Assessor | Buildings | 33,523 | 19,674 | 21,780 | 32,624 | 2026-09 | none posted |
| Wayne County, IN | 30,736 | Wayne County, Indiana GIS | GIS Web SDE.SDE.Development Residential  | 24,838 | 24,797 | 24,774 | 0 | 2024-11 | none posted |
| Kauai County, HI | 30,471 | County of Kauai | BUILDINGS publicview | 29,082 | 23,956 | 24,048 | 1,695 | 2026-10 | disclaimer only |
| Pittsylvania County, VA | 29,443 | Pittsylvania County | Tax Parcels | 61,104 | 29,269 | 28,682 | 29,918 | 2026-10 | none posted |
| Calaveras County, CA | 27,683 | CALAVERAS COUNTY GIS | GISPARCELS PUBLIC | 43,652 | 24,513 | 24,729 | 29,698 | 2026-05 | none posted |
| Tehama County, CA | 27,527 | Tehama County Transportation Commission Geos | TaxParcel 2023 05 11 w Ownership | 43,100 | 19,215 | 19,272 | 20,912 | 2023-05 | none posted |
| Hall County, NE | 25,569 | City of Grand Island | Points For the Sales Search | 28,911 | 17,458 | 20,011 | 20,037 | 2026-08 | disclaimer only |
| Tuscola County, MI | 24,011 | Tuscola County GIS | Parcel Value Analysis Tax Parcels | 35,548 | 14,090 | 22,066 | 16,923 | 2026-10 | none posted |
| Clinton County, OH | 18,039 | Clinton County Ohio GIS | Dwelling Year Built | 13,856 | 13,332 | 13,825 | 13,856 | 2023-09 | none posted |
| Orange County, VA | 16,131 | Orange County, VA | TaxParcelsService(M) | 22,082 | 14,363 | 14,395 | 14,917 | 2018-12 | limits: internal |
| Elmore County, ID | 12,271 | (catalog account) | PARCEL DATA 2021 | 20,811 | 7,928 | 7,906 | 7,833 | 2021-06 | disclaimer only |
| Crook County, OR | 11,800 | Crook County, Oregon | Taxlots Improvements | 37,611 | 10,089 | 10,119 | 27,680 | 2025-07 | disclaimer only |
| Salem city, VA | 11,112 | (catalog account) | TaxParcels | 10,765 | 8,391 | 9,094 | 9,452 | 2026-11 | limits: permission |
| Mariposa County, CA | 9,836 | Mariposa County, California, USA. | Parcel Characteristics | 15,011 | 4,989 | 4,761 | 5,583 | 2026-11 | limits: personal |
| New Kent County, VA | 9,795 | New Kent County, VA GIS Office | Parcels | 18,846 | 10,129 | 10,135 | 0 | 2026-06 | none posted |
| Giles County, VA | 8,338 | Giles County VA | Parcels Joiined | 14,273 | 7,027 | 7,492 | 7,489 | 2026-10 | none posted |
| Ketchikan Gateway Borough, AK | 6,698 | (catalog account) | AddressPoints KetchikanAK | 10,187 | 3,277 | 7,475 | 8,721 | 2026-08 | none posted |
| Evans County, GA | 4,700 | (catalog account) | PE REPROP  | 3,784 | 2,349 | 2,727 | 3,348 | 2024-02 | none posted |


Notes on the largest:

- **Fulton GA** is a copy of the Tax Assessor's residential table inside a City of Atlanta project (lead hazard
  parcels), posted March 2025 with no terms. It proves the table is in the city's hands; as a source it's a one-time
  copy. Ask Atlanta or Fulton whether a maintained one exists.
- **Lake IL** and **Northampton PA** are older copies (2022) posted by a fire chiefs' association and a township
  authority from the county's own servers. Find the county's current layer behind each.
- **Greenville SC** is the county's own map server. The county also sells this file for $500, so ask before using the
  service.
- **Lucas OH** was already known: its bath column is unclear, and the question letter is drafted.
- **Lorain OH**: an earlier round read Lorain's open-data terms as barring display elsewhere without written
  approval, so its letter stands whatever this catalog entry shows.
- **Fairfax VA** is listed for completeness: its terms limit use to internal purposes, as recorded before.
- **Sedgwick KS** (through Wichita), **Spartanburg SC**, **Kings CA**, **Yamhill OR**, **Klamath OR**,
  **Burleigh ND**, **Creek OK**, **Kauai HI**, **Pittsylvania VA** and **Calaveras CA** are current (2026) and posted by
  the county or a city with no limit seen. Sedgwick's Appraiser sells custom queries, so its own terms need reading.
- **Wayne OH**: the Auditor's website refuses scripts (recorded November 14); this layer is the county mapping
  office's, on a different open service. Ask before treating that as allowed.
- The earlier name search had marked Marin, Butte and Kings "no open layer" and Yamhill, Benton and Burleigh
  "nothing found".

### 3.2 Stored counties that lack bedrooms and baths (21 counties, 2.65M homes, plus those marked "limits")

These add bedrooms and baths to records already in storage, the same fill join used for Osceola and Duval.


| County | Homes | Published by | Layer | Records | Bedrooms | Baths | Year built | Last edit | Terms seen |
|---|---:|---|---|---:|---:|---:|---:|---|---|
| Orange County, FL | 586,805 | Orange County Government GIS | Parcels | 498,449 | 419,644 | 419,902 | 442,227 | 2021-02 | disclaimer only |
| Lee County, FL | 441,194 | Lee County Florida GIS | Lee County Parcels | 565,345 | 396,275 | 402,776 | 0 | 2026-11 | disclaimer only |
| DeKalb County, GA | 330,830 | DeKalb County GIS | PARCEL TAX JOIN | 243,778 | 216,809 | 217,738 | 0 | 2025-03 | none posted |
| Volusia County, FL | 282,109 | County of Volusia | Parcel Ownership | 313,735 | 235,969 | 235,818 | 0 | 2024-08 | disclaimer only |
| Utah County, UT | 211,066 | Utah County | Tax Parcels | 273,040 | 194,597 | 194,591 | 205,815 | 2024-12 | none posted |
| Marion County, FL | 188,277 | (catalog account) | Parcels | 291,857 | 185,507 | 185,757 | 191,988 | 2025-12 | disclaimer only |
| Weld County, CO | 129,637 | (catalog account) | Sales Point open data | 243,867 | 180,087 | 135,888 | 142,324 | 2026-11 | limits: internal |
| Bay County, FL | 108,362 | Bay County GIS | Parcels | 134,873 | 80,238 | 80,254 | 105,573 | 2026-11 | disclaimer only |
| Gaston County, NC | 101,671 | (catalog account) | Gaston County Parcels | 108,013 | 77,211 | 77,092 | 82,153 | 2020-12 | limits: commercial, resale |
| Johnston County, NC | 91,218 | Johnston County GIS | Parcels | 123,340 | 87,440 | 87,449 | 91,161 | 2025-09 | none posted |
| Walton County, FL | 61,272 | Walton County Geographical Information Syste | PropApprBuildings | 44,195 | 40,844 | 42,931 | 44,194 | 2021-07 | disclaimer only |
| Wright County, MN | 57,416 | Wright County GIS | Buildings Current MapIt | 53,867 | 53,699 | 53,759 | 53,867 | 2026-11 | none posted |
| Monongalia County, WV | 49,932 | City of Morgantown, WV | 2019 Tax Parcels | 53,480 | 28,270 | 28,158 | 28,314 | 2020-03 | none posted |
| Nash County, NC | 43,797 | City of Rocky Mount NC | Nash Parcels in the RMMPO | 30,478 | 21,597 | 21,566 | 21,670 | 2023-08 | none posted |
| Grant County, WA | 40,214 | Grant County, Washington | Parcel Residential Characteristics | 35,573 | 33,593 | 33,717 | 35,569 | 2023-10 | disclaimer only |
| Raleigh County, WV | 34,604 | Beckley/Raleigh County MetroGIS Committee | parcel | 59,964 | 25,140 | 24,936 | 25,157 | 2019-02 | none posted |
| Wilkes County, NC | 31,836 | WILKES COUNTY GIS | Parcels | 52,717 | 22,213 | 22,211 | 24,696 | 2019-02 | none posted |
| Franklin County, WA | 31,183 | City of Pasco | Parcels | 26,453 | 21,805 | 21,808 | 23,389 | 2026-02 | none posted |
| Lenoir County, NC | 26,879 | City of Kinston | CurrentParcels | 36,346 | 19,669 | 19,669 | 0 | 2026-10 | disclaimer only |
| Pitkin County, CO | 13,412 | Pitkin County, Colorado | Parcel | 20,253 | 14,008 | 14,863 | 16,522 | 2026-11 | none posted |
| Pocahontas County, WV | 6,834 | (catalog account) | Parcels | 15,090 | 5,272 | 4,769 | 5,378 | 2026-05 | disclaimer only |
| San Miguel County, CO | 6,656 | San Miguel County, Colorado | Improvements | 8,733 | 6,597 | 6,894 | 8,731 | 2026-11 | disclaimer only |
| Bear Lake County, ID | 4,020 | Bear Lake County Assessor's Office | Improvements | 18,436 | 3,887 | 4,228 | 18,143 | 2026-11 | none posted |


What earlier rounds recorded about these, which still binds:

- **Lee FL.** The layer is the county government's nightly copy of the Property Appraiser's attributes. The
  Appraiser's own policy allows only "personal, non-business use" and forbids redistribution, so under the November 8
  rule the copy can't be used without the Appraiser's yes. The letter can now ask for exactly that.
- **Orange, Volusia, Marion, Bay and Walton FL.** Each Appraiser's own site refuses scripts, so its terms were never
  read. A person has to read them before the county's copy is used. Orange's county copy was last edited in 2021; the
  Appraiser posts its own parcels layer with bedrooms and baths in the same catalog.
- **Utah County UT.** Its file host and map services answer scripts with "access restricted" and weren't worked
  around. The layer here is a December 2024 dashboard copy on ArcGIS Online. It isn't cleared; the letter stands.
- **Gaston NC and Weld CO** post terms that limit commercial or outside use.

### 3.3 Partial coverage (54 counties, 6.7M homes in them)

A city's layer covers the city, not the county. The largest:


| County | Homes | Published by | Layer | Records | Bedrooms | Baths | Year built | Last edit | Terms seen |
|---|---:|---|---|---:|---:|---:|---:|---|---|
| King County, WA | 1,003,284 | City of Seattle ArcGIS Online | King County Assessor Residential Unit Ty | 186,378 | 186,378 | 0 | 186,378 | 2026-11 | PDDL-1.0 |
| Queens County, NY | 910,206 | NYS ITS GIS Program Office | Parcel Boundaries Simplified 9 7 23 | 712,238 | 693,665 | 0 | 698,746 | 2024-05 | disclaimer only |
| Alameda County, CA | 637,212 | City of Oakland GIS | AC Parcels2020 | 224,041 | 191,856 | 0 | 198,396 | 2021-05 | none posted |
| Tulsa County, OK | 297,882 | City of Tulsa | ResidentialParcels | 129,736 | 0 | 126,100 | 127,254 | 2026-03 | disclaimer only |
| Ventura County, CA | 295,878 | City of Oxnard GIS | Parcel Data | 91,223 | 73,938 | 73,847 | 81,179 | 2023-09 | none posted |
| San Mateo County, CA | 287,184 | City of San Mateo | Tax Parcels | 29,910 | 962 | 25,387 | 27,977 | 2026-11 | none posted |
| Providence County, RI | 277,740 | City of Providence | Parcels wCAMA | 44,128 | 34,425 | 34,003 | 37,622 | 2024-09 | none posted |
| Arapahoe County, CO | 269,345 | City of Centennial | Parcel Building Data | 39,161 | 35,548 | 37,936 | 0 | 2021-03 | none posted |
| Passaic County, NJ | 185,816 | NJ Office of Information Technology, Office  | Parcel Clifton ModIV 2025 | 23,729 | 21,446 | 21,518 | 23,036 | 2025-08 | disclaimer only |
| Douglas County, CO | 144,432 | City of Littleton | Parcel | 63,232 | 15,813 | 17,544 | 0 | 2026-10 | limits: internal |
| Anoka County, MN | 141,863 | City of Lexington GIS | Parcels AnokaCo | 140,328 | 117,564 | 54,808 | 119,198 | 2025-07 | none posted |
| San Luis Obispo County, CA | 125,669 | City of Paso Robles | PasoRoblesParcels | 14,859 | 11,262 | 11,380 | 11,787 | 2023-01 | limits: permission |
| Brown County, WI | 115,493 | City of Green Bay | GB Parcels | 35,243 | 29,400 | 29,387 | 29,411 | 2026-09 | none posted |
| St. Louis County, MN | 104,263 | City of Duluth, Minnesota | MyCivicMap | 54,327 | 26,503 | 26,591 | 29,936 | 2026-01 | none posted |
| Linn County, IA | 103,104 | Linn County Iowa GIS | Assessor Residential Building | 34,641 | 34,063 | 34,201 | 34,641 | 2026-11 | disclaimer only |
| Smith County, TX | 99,673 | City of Tyler | Tax Parcels  | 132,357 | 0 | 65,212 | 76,290 | 2021-11 | disclaimer only |
| Jackson County, OR | 97,991 | Jackson County GIS | Latest Sales | 60,545 | 40,860 | 41,291 | 45,779 | 2024-10 | CC-BY-4.0 |
| Montgomery County, TN | 93,445 | City of Clarksville | Parcels num | 89,979 | 3,671 | 29,105 | 79,147 | 2025-07 | none posted |
| Benton County, WA | 83,101 | Benton County, WA | AssessorPropVal | 74,767 | 0 | 55,728 | 0 | 2021-08 | none posted |
| Yolo County, CA | 82,447 | City of Woodland | Parcel | 17,978 | 15,917 | 15,947 | 16,413 | 2020-05 | none posted |
| Outagamie County, WI | 80,915 | City of Appleton | MyPropertyV2 Publish | 36,061 | 25,368 | 25,684 | 0 | 2026-11 | none posted |
| Penobscot County, ME | 75,683 | City of Bangor, Maine | Parcel Assessing Data | 11,844 | 8,115 | 8,118 | 8,114 | 2026-07 | none posted |
| Licking County, OH | 73,273 | City of Newark GIS | Auditors Parcels WFL1 | 13,361 | 10,514 | 0 | 10,921 | 2024-09 | none posted |
| Franklin County, PA | 67,157 | County of Franklin, Pennsylvania | FC UPI Labels | 76,864 | 5,824 | 53,880 | 47,245 | 2023-04 | none posted |
| Washington County, RI | 66,385 | Town of South Kingstown, Rhode Island | VISION Parcels | 15,093 | 12,110 | 11,639 | 12,593 | 2022-11 | none posted |


King County's row is the City of Seattle's public-domain (PDDL) copy of the Assessor's residential table: bedrooms,
living area, effective year, stories and condition for homes in Seattle. It has no bath count, so it doesn't reach the
bar alone.

### 3.4 Unofficial copies (103 counties, 11.2M homes)

Layers with the right columns posted by a consultant, a school, a company or a private account. They aren't sources:
nothing says where the rows came from, and some are a data vendor's. Each is a lead that the columns exist in a file
somebody was given. The full list is in the county table (`route_kind` = `unofficial_copy`).

### 3.5 What the sweep can't see

- Servers that aren't registered in the two catalogs. Many counties run their own. A public list of about 7,400
  government map servers exists (mappingsupport.com); its author bars commercial products built on it without written
  permission, so it wasn't used. Asking him costs nothing; so does building our own list from the hosts the sweep
  already found.
- Whether a layer's terms page adds limits the catalog entry doesn't show.
- How each bath column counts half baths (the Lucas question, again and again).

## 4. New direction 2: state files that were misread or never built

- **Indiana, 2.98M homes.** State rule 50 IAC 26 makes every county send the state a DWELLING file each
  year with total bedrooms, full baths, half baths, finished living area, story height, heating, central air,
  fireplaces and garage, and an IMPROVE file with year built, effective year, grade and condition. The earlier note
  ("no beds or baths in them") came from a scan that couldn't be read. The state's download page offers only the parcel,
  tax bill, adjustment and personal property files; the building files come by email from the Department of Local
  Government Finance. The drafted letter goes to the state's GIS office and asks for the wrong thing: it should go to
  data@dlgf.in.gov and name the PARCEL, LAND, IMPROVE, DWELLING and sales disclosure files for all 92 counties.
- **Never built, free today:** Indiana's parcel file (address, lot, value: 2.98M homes), Virginia's CC0
  statewide file (3.25M homes with nothing stored; 24 localities carry building facts), Ohio's
  statewide parcel layer (address and lot for the 2.60M homes without a connector) and North
  Dakota's. None reaches the bar alone. Each moves homes from "no record" to a matched address with a value and a lot,
  and gives the estimates and the household's one-tap questions something to stand on.

## 5. New direction 3: regional planning agencies

Councils of governments build parcel and building files for their forecasts and post them.

- **SEMCOG (Detroit region, 7 counties).** 1,674,743 building points; 1,488,686 one-home buildings with an address on
  99.7%, year built on 97.8%, residential square feet on all (a figure ending in 00 is the agency's estimate, so those
  rows are skipped) and stories on 99.5%. Its license grants a perpetual, royalty-free right to use, publish and make
  derivative works, with a copyright notice. No bedrooms or baths. It gives Macomb, Washtenaw, Livingston, St. Clair and
  Monroe (no file today) and the rest of Wayne four of the six facts.
- **The Bay Area's agency portal (MTC)** holds about 30 city and county parcel layers collected for its housing
  inventory, several with Santa Clara County's bedroom, bath and year-built columns for one city each.
- **Maricopa Association of Governments** posts town parcel layers with the Assessor's year, size, bath count, walls,
  roof, heating and cooling.
- Not yet checked: Sacramento, San Diego, Chicago, Philadelphia, Atlanta, Houston, Dallas, Kansas City, Cincinnati,
  Cleveland, Pittsburgh, Baltimore and Washington's councils.

## 6. Where the assessor keeps no bedroom count

The bar asks for bedrooms from the county's own record. Some offices don't record them.

| Place | Homes | What the record has | Checked |
|---|---:|---|---|
| Maricopa County AZ | 1.88M | Year, size, bath fixtures or count, lot, value, walls, roof, heating, cooling, garage | The Assessor's layout, read November 11 |
| Maryland (24 counties) | 2.56M | Year, size, lot, value, stories | Stored: bedrooms on 0% |
| Tennessee, the state's 86 counties | about 1.6M | Unconfirmed until one county's dictionary is read | Not confirmed |
| Other Arizona counties | about 1.3M | Not read | Not confirmed |

No route in this document changes that. These homes go live only if the founder allows a county to go live on the
facts its record has, with the bedroom row saying the county doesn't record it and asking the household.

## 7. Other directions, smaller or for later

- **Household capture.** Where only a lookup page exists, the person can open the county's page themselves (link and
  confirm does this today), save or print it, and give it to Pantopus through household documents, which already reads
  a PDF and asks the household to confirm each fact. That fills every row the county shows, in any county, without
  Pantopus ever fetching a page. It needs the document reader to accept a county record page; a share button in the
  apps would make it one step.
- **The Internet Archive** keeps past copies of county bulk files. King County's residential building file is there
  from January and December 2022. Useful only where a county withdrew a file it once published freely, and always
  years old.
- **Other official records that state bedrooms.** Septic permits are sized by bedroom count; Colorado, Rhode Island,
  Delaware, Vermont, Maine and New Hampshire keep them, some as open data. Short-term rental and rental registrations
  list bedrooms in Seattle, New Orleans, Cambridge and Norfolk. Each covers a small share of homes and would show as
  its own row, not as the county's record.
- **Rows no assessor file has.** Florida's health department publishes sewer or septic and public water or well for
  10,023,191 parcels, keyed by the same parcel number as the state roll.
- **A vendor's free edition.** One parcel aggregator sold its national file for $1 in January 2026. It is a reseller's
  copy, the kind D2 keeps out, and it costs money. Not pursued.

## 8. Every state

"Found" counts the counties in sections 3.1 to 3.3. The county table has every row.

| State | Homes | Live | Stored, short | No file | Found (full / part) | Route for the gap |
|---|---:|---:|---:|---:|---|---|
| TX | 12.13M | 2.67M | 9.05M | 0.40M | 0 / 1 | State file stored for 196 counties and 26 appraisal districts connected. Williamson's and Collin's open data found. Many districts keep no bedroom count: household. |
| CA | 14.64M | 6.06M | 2.15M | 6.44M | 7 / 5 | Layers found: Marin, Kings, Calaveras, Tehama, El Dorado, Butte, and parts of Alameda (Oakland), Ventura (Oxnard), San Mateo, Yolo, San Luis Obispo. The Bay Area regional agency's portal carries city layers with Santa Clara County's bedrooms and baths. Orange, Santa Clara, Sacramento, Fresno, Kern: sold, or a letter. |
| NY | 8.59M | 0.94M | 7.64M | - | 0 / 1 | The state's parcel layer (down since November 13) covers 39 counties; 25 lack bath totals. Layers with bedrooms found for Westchester, Ulster, Sullivan, Putnam (Putnam's terms limit use). New York City's bedrooms sit in the state's layer. |
| FL | 10.26M | 3.48M | 6.78M | - | 6 / 0 | State roll stored for all 67 (no bedrooms or baths). County GIS layers with both found for Lee, Orange, Volusia, Marion, Bay, Walton. The rest: appraiser letters, or a person's download where a site refuses scripts. |
| MI | 4.62M | - | 1.36M | 3.26M | 1 / 0 | SEMCOG's regional building file covers 7 counties: year built, size, stories, address under a written license (no bedrooms or baths). Oakland's own layer has both; Tuscola found. Elsewhere BS&A lookup sites: letters. |
| PA | 5.81M | 1.24M | 0.75M | 3.82M | 1 / 1 | 5 counties connected. Northampton through a township authority's copy (2022). Bucks, Delaware, Chester, Lancaster, York: letters; state law lets counties charge market price. |
| GA | 4.54M | - | 0.33M | 4.21M | 3 / 1 | Layers found: Fulton (a City of Atlanta project's copy of the county's residential table, March 2025) and DeKalb's own. Elsewhere qPublic lookup sites: letters; household. |
| NC | 4.90M | 0.94M | 3.72M | 0.24M | 4 / 4 | OneMap stored for 86 counties (no bedrooms or baths). County layers with both found for Guilford, Johnston, Gaston (terms limit use), Nash, Wilkes. More by letter. |
| OH | 5.29M | 1.45M | 1.25M | 2.60M | 5 / 1 | 14 counties connected. Layers found: Medina, Wayne, Clinton; Lucas (known; its bath column is unclear). The other auditors by letter under Ohio's records law; the state parcel layer (address, lot) isn't built. |
| NJ | 3.79M | - | 3.79M | - | 0 / 1 | State file stored: year, lot, value. One town layer with bedrooms found (Clifton, hosted by the state). Household. |
| VA | 3.68M | 0.43M | - | 3.25M | 3 / 7 | 6 localities connected. Found: Pittsylvania, New Kent, Giles; Albemarle partly through Charlottesville. Fairfax's layer exists but its terms limit use. The state's CC0 file (24 localities with facts) isn't built. Virginia Beach, Prince William, Loudoun: letters. |
| AZ | 3.19M | - | - | 3.19M | - | Maricopa's free file after a signed form (five facts; the Assessor keeps no bedroom count). Pima, Pinal, Yavapai, Mohave: letters with the commercial-purpose statement Arizona law asks for. |
| IL | 5.46M | 2.28M | - | 3.18M | 2 / 0 | Cook is live. Lake and Peoria found (copies posted by a fire chiefs' association and a regional planning commission). DuPage, Will, Kane, McHenry: letters; assessing is by township. |
| TN | 3.14M | - | 0.36M | 2.79M | 0 / 2 | State file for 86 counties by a person's form, one per county (building fields unconfirmed). Montgomery and Bradley partial. Shelby, Knox, Hamilton, Rutherford, Williamson: letters. |
| MA | 3.03M | - | 3.03M | - | 0 / 1 | MassGIS stored: year, size, value; a room count but no bedrooms. Boston and Cambridge have them; a few more cities found. The rest: household. |
| IN | 2.98M | - | - | 2.98M | 1 / 0 | One email to the state (DLGF) for its building files: all six facts for all 92 counties. The parcel file (address, lot, value) is a free download today and isn't built. |
| WA | 3.31M | 0.72M | 1.02M | 1.57M | 2 / 2 | State file stored for 31 counties (address, value). King: one click by the founder opens the Assessor's files; Seattle's public-domain copy covers the city meanwhile (bedrooms, size, year; no baths). Snohomish letter; Spokane waits on D8. Grant and Franklin found. |
| MD | 2.56M | - | 2.56M | - | - | State file stored: year, size, lot, value. The state assessor publishes no bedroom count. Bedrooms from the household. |
| SC | 2.44M | - | 0.12M | 2.32M | 4 / 2 | Found: Spartanburg's own CAMA layer, Lexington (through a city), Greenwood, and Greenville's county map service (the county also sells the file, so ask first). Charleston, Horry, Richland, York: letters. |
| AL | 2.34M | - | - | 2.34M | - | No state file; counties sit on vendor lookup sites, and the records law is limited to Alabama residents. Nothing official found in the catalogs. Household confirmations and labeled estimates; letters need an Alabama requester. |
| MO | 2.83M | 0.50M | 0.45M | 1.88M | 1 / 0 | Greene through the City of Springfield's county parcels. St. Louis County's own layer has year and size. St. Louis city, Clay, Jefferson, Boone: letters. |
| LA | 2.11M | - | - | 2.11M | - | Nothing found. Assessors run their own sites; state law treats rolls as public. Letters drafted for East Baton Rouge and others. |
| WI | 2.78M | 0.69M | 2.09M | 0.00M | 0 / 3 | State file stored (few homes typed as houses). City layers found: Green Bay, Appleton. Assessing is municipal: letters; household. |
| MN | 2.55M | 0.47M | 1.77M | 0.30M | 1 / 4 | 57 counties stored. Bedrooms and baths found for Wright, Anoka (through a city), Minneapolis and Ramsey's assessor data. Others: county letters. |
| KY | 2.02M | - | - | 2.02M | - | Nothing found. Property valuation offices sell their files and non-residents have no enforceable right. Letters; household. |
| OR | 1.86M | - | 0.89M | 0.97M | 4 / 2 | Found: Yamhill, Klamath, Benton (through Corvallis); Jackson and Josephine partial. Lane and Marion: letters. |
| PR | 1.63M | - | - | 1.63M | - | The tax agency (CRIM) by request. |
| CO | 2.59M | 1.11M | 1.27M | 0.21M | 2 / 5 | State file stored for 33 counties (address, value). Layers found: Pitkin; Weld ("internal use" wording); Douglas via Littleton. Letters drafted: Arapahoe, Douglas, Weld. |
| OK | 1.78M | 0.36M | 0.30M | 1.12M | 2 / 2 | Oklahoma County live, Tulsa stored. Found: Comanche (the City of Lawton's copy of assessor data) and Creek's assessor layer. Letters elsewhere. |
| AR | 1.39M | - | - | 1.39M | - | The state's county export after one written question (letter drafted); the state layer gives address and value. |
| IA | 1.44M | 0.04M | - | 1.39M | 0 / 1 | Linn's own residential layer found (covers a third of the county). Polk, Scott and the rest: letters; most assessors are on vendor lookup sites. |
| MS | 1.34M | - | - | 1.34M | - | The state layer after one written question (letter drafted). Nothing official found in the catalogs. |
| KS | 1.29M | - | - | 1.29M | 1 / 0 | Sedgwick through the City of Wichita's parcels (bedrooms, baths, year built; updated June 2026). Johnson sells its file ($100); the state sells county files. Open-records letters. |
| UT | 1.22M | - | 1.22M | - | 1 / 0 | State file stored (year, lot, value). Utah County's own layer with bedrooms and baths found. Salt Lake sells its file. |
| NM | 0.96M | - | 0.30M | 0.65M | - | Bernalillo stored (year only). Dona Ana, Santa Fe, Sandoval: letters. |
| NE | 0.86M | - | 0.25M | 0.61M | 1 / 0 | State file after one written question (year, size, value). Hall through Grand Island's layer. |
| WV | 0.86M | - | 0.86M | - | 3 / 0 | State file stored (year, size). A few counties' layers found, most of them old. A letter to the state tax department. |
| ID | 0.80M | - | 0.07M | 0.73M | 2 / 1 | State improvement table covers 13 counties. Ada letter drafted; Elmore found; Bannock and Valley partial. |
| ME | 0.75M | - | 0.75M | - | 0 / 2 | State parcels stored (thin). A few towns' layers found. Town letters; household. |
| NH | 0.65M | - | - | 0.65M | 0 / 1 | Nothing stored; assessing is by town. Rochester and a few towns found. Town letters; household. |
| HI | 0.57M | - | - | 0.57M | 1 / 0 | Kauai's own buildings layer found. Honolulu: letter drafted. |
| RI | 0.49M | - | - | 0.49M | 0 / 3 | Nothing stored; assessing is by town. Providence, Newport and South Kingstown layers found. Town letters. |
| DE | 0.46M | - | - | 0.46M | - | Nothing stored. New Castle letter drafted. The state's septic permits list bedrooms for rural homes (not measured). |
| SD | 0.41M | - | - | 0.41M | - | Nothing found. Minnehaha and Pennington: letters. |
| ND | 0.38M | - | - | 0.38M | 1 / 0 | Burleigh through the City of Bismarck's parcels. The state parcel program (address, lot, value) isn't built. |
| VT | 0.34M | - | 0.34M | - | 0 / 1 | State grand list stored (thin). Town letters; household. |
| WY | 0.28M | - | - | 0.28M | - | State file after one written question. |
| AK | 0.33M | 0.12M | - | 0.21M | 1 / 0 | Anchorage is live. Boroughs one by one: Fairbanks letter drafted; a Ketchikan layer found. |
| NV | 1.33M | 1.17M | - | 0.16M | - | Clark and Washoe are live. The rest are small; the state layer is from 2018. |
| MT | 0.53M | 0.51M | 0.02M | - | - | Live (55 of 56). |
| CT | 1.54M | 1.54M | - | - | - | Live. |
| DC | 0.36M | 0.36M | - | - | - | Live. |

## 9. Every county, by route

| Route | Counties | Homes |
|---|---:|---:|
| Live | 144 | 27.1M |
| Government layer with bedrooms and baths found | 60 | 5.9M |
| Government layer found, terms limit use | 6 | 0.7M |
| Government layer covers part of the county | 54 | 6.7M |
| Indiana's state files, one email | 91 | 2.9M |
| Tennessee's state file, a person's forms | 85 | 1.6M |
| Regional agency file (year, size, stories) | 7 | 2.1M |
| Assessor keeps no bedroom count | 25 | 4.4M |
| Unofficial copy seen: trace to the office | 103 | 11.2M |
| Letter drafted, not sent | 188 | 17.1M |
| Virginia's statewide file, not built | 98 | 1.9M |
| Stored without bedrooms: letter, else household | 660 | 30.9M |
| Stored with bedrooms, short on another fact | 45 | 7.4M |
| No open file found: household | 1,656 | 25.3M |

A county appears once, under the first route that applies in the order above.

## 10. Decisions for the founder

1. **A second-publishers lane.** Builders take sections 3.1 and 3.2 biggest first: read each layer's terms in full,
   confirm the office behind it, build, hold to the six-fact bar, vet, switch. Same rules as WP10.
2. **Three things only the founder can do:** the Indiana email (corrected), King County's acknowledgement click, and
   Maricopa's form.
3. **The letters.** None has been sent. A session can put every drafted letter into the founder's mailbox as a draft
   so sending is one pass.
4. **The bar where no bedroom count exists** (section 6): keep it, or let those counties go live on what the record
   has.
5. **Household capture** (section 7): whether to build it.
6. **The statewide floors** (Indiana's parcel file, Virginia, Ohio, North Dakota): whether to build them though they
   can't reach the bar.

## 11. What the builders' full reads found (added November 15, about 06:00 UTC)

Three builders surveyed the lists from section 3 with field lists and counts only, reading each layer's terms and the
origin office's, and counting all six facts on houses.

| Lane | Rows | Buildable | Waiting on the founder | Letters and questions |
|---|---:|---|---|---|
| No-file counties, countywide layer | 43 | Nevada CA (39,141 houses), Crook OR (about 8,571), Ketchikan AK (2,287) | Sedgwick KS (168,645 houses; its only lot is the county's mapped acres), Northampton PA (100,336; the county sells the same data) | 36 |
| Stored counties | 80 | DeKalb GA, Johnston NC, Wright MN, Jefferson WV, Wilkes NC, Lenoir NC, Summit CO (about 374,000 houses; approved, building) | Lee and five more Florida counties, Utah County (as section 3.2) | the rest |
| No-file counties, city layers and leads | 100 | Hood River OR (7,034), City of Bristol VA (8,634), City of Newport RI (4,625), City of Rochester NH (6,573) | Jackson OR (39,329; only homes sold since 2002) | 94 |

Why rows fell out, most common first: another bar fact missing or short (no living area in Spartanburg's layer, no
value in Yamhill's, lot on 49% in Lexington's, bedrooms under 90% in several); a bath column with whole numbers and no
definition (Calaveras, as Lucas); one-time or stale copies (Greene MO, Tehama, Fulton); limiting terms found on a full
read (Kauai, Salem VA, Orange VA, El Dorado's regional copy); a block on the office's own server (Marin, Kings); and
every lead posted by a consultant, university or vendor.

What this says about the method: a column sweep finds candidates fast and cheaply, and it found real ones earlier
rounds missed. Its counts overstate the yield many times over, because having a bedroom column is not the same
as meeting the bar under usable terms. The next sweep should count all six facts on houses before a layer is called
"found".

## What I couldn't confirm

- Each layer's full terms. Only the catalog entry was read.
- That each layer is current and maintained. Last edit dates are in the tables; several are one-time copies.
- How each bath column counts half baths.
- Tennessee's and the other Arizona counties' building fields.
- Indiana's fill: the rule requires the columns; how completely each county fills them shows only in the files.
- The regional agencies listed as not yet checked.
- Whether SEMCOG's assessing data carries limits from the local units that supplied it (its license excludes
  third-party rights).

## Sources

Read November 15, 2026 (UTC).

- Storage: private bucket, `index/states/*.json`, each serving release's `report.json`, `index/switches/production.json`.
- Catalogs: ArcGIS Hub dataset index (opendata.arcgis.com/api/v3/datasets); ArcGIS Online item records
  (arcgis.com/sharing/rest); Socrata's catalog (api.us.socrata.com/api/catalog/v1). Each layer's own address is in the
  county table.
- Indiana: [50 IAC 26 file formats](https://www.in.gov/dlgf/files/50-IAC-26-File-Formats.pdf);
  [Gateway download page](https://gateway.ifionline.org/public/download.aspx);
  [property file documentation](https://gateway.ifionline.org/guides/downloads/property-file-documentation.xlsx).
- SEMCOG: [building points](https://gis.semcog.org/server/rest/services/Hosted/Building_Points/FeatureServer/34);
  [license](https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement).
- Bay Area: [data.bayareametro.gov](https://data.bayareametro.gov/).
- Seattle: [King County Assessor residential unit types and sizes](https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/ALL_UNITS_GEO_CENTROID/FeatureServer/0).
- Florida Department of Health: [wastewater and drinking water by parcel](https://gis.floridahealth.gov/server/rest/services/FLWMI/FLWMI_Wastewater/FeatureServer/0).
- Internet Archive: capture index for King County's residential building file.
- Tennessee: [public-use parcel service](https://www.arcgis.com/home/item.html?id=e356f1a241844d6f9025f2fa4e977df3).
- New York: gisservices.its.ny.gov, NYS_Tax_Parcels_Public.
- Government map server list: [mappingsupport.com](https://mappingsupport.com/p/surf_gis/list-federal-state-county-city-GIS-servers.pdf) (terms read; not used).
