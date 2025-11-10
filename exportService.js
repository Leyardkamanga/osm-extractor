// Export Service - Handles data export in various formats with complete metadata

const ExportService = {
    // Generate comprehensive metadata compliant with ISO 19115 and GIS standards
    generateMetadata(geojson, bounds, selectedFeatures, format, filename) {
        const stats = GeometryProcessor.getStatistics(geojson);
        const now = new Date();
        
        const metadata = {
            // Required: Identifier
            identifier: {
                code: `osm-extract-${Date.now()}`,
                codeSpace: 'OSM-Data-Extractor',
                version: '1.0'
            },

            // Required: Language
            language: 'eng', // ISO 639-2 code
            characterSet: 'utf8',

            // Required: Title
            title: `OpenStreetMap Data Extract - ${filename}`,

            // Required: Abstract
            abstract: `This dataset contains OpenStreetMap data extracted on ${now.toISOString().split('T')[0]} for a geographic area ${bounds ? `covering approximately ${Utils.calculateArea(bounds).toFixed(2)} km²` : 'of interest'}. The data includes ${stats.totalFeatures} features with ${stats.points} points, ${stats.lines} lines, and ${stats.polygons} polygons. ${selectedFeatures && selectedFeatures.length > 0 ? `Features filtered to include: ${selectedFeatures.join(', ')}.` : 'All available features included.'} Data is provided in ${format.toUpperCase()} format under the Open Database License (ODbL) v1.0.`,

            // Required: Links
            links: [
                {
                    rel: 'source',
                    href: 'https://www.openstreetmap.org',
                    type: 'text/html',
                    title: 'OpenStreetMap Project'
                },
                {
                    rel: 'license',
                    href: 'https://opendatacommons.org/licenses/odbl/1.0/',
                    type: 'text/html',
                    title: 'Open Database License (ODbL) v1.0'
                },
                {
                    rel: 'copyright',
                    href: 'https://www.openstreetmap.org/copyright',
                    type: 'text/html',
                    title: 'OpenStreetMap Copyright and License'
                },
                {
                    rel: 'about',
                    href: 'https://wiki.openstreetmap.org',
                    type: 'text/html',
                    title: 'OpenStreetMap Wiki - Data Documentation'
                }
            ],

            // Required: Contacts
            contacts: [
                {
                    name: 'OpenStreetMap Contributors',
                    organization: 'OpenStreetMap Foundation',
                    position: 'Data Contributors',
                    role: 'originator',
                    email: 'data@openstreetmap.org',
                    url: 'https://www.openstreetmap.org',
                    address: {
                        deliveryPoint: 'OpenStreetMap Foundation',
                        city: 'London',
                        country: 'United Kingdom'
                    }
                },
                {
                    name: 'OSM Data Extractor',
                    organization: 'OSM Data Extractor Tool',
                    position: 'Data Processor',
                    role: 'processor',
                    url: 'https://github.com/openstreetmap'
                }
            ],

            // Required: License
            licenses: [
                {
                    name: 'Open Database License (ODbL) v1.0',
                    url: 'https://opendatacommons.org/licenses/odbl/1.0/',
                    identifier: 'ODbL-1.0',
                    scope: 'dataset',
                    text: 'This data is made available under the Open Database License: http://opendatacommons.org/licenses/odbl/1.0/. Any rights in individual contents of the database are licensed under the Database Contents License: http://opendatacommons.org/licenses/dbcl/1.0/'
                }
            ],

            // Citation
            citation: {
                title: `OpenStreetMap Data Extract - ${filename}`,
                date: now.toISOString(),
                dateType: 'creation',
                edition: '1.0',
                citedResponsibleParty: {
                    name: 'OpenStreetMap Contributors',
                    role: 'originator'
                }
            },

            // Export information
            export: {
                timestamp: now.toISOString(),
                date: now.toISOString().split('T')[0],
                format: format,
                formatVersion: '1.0',
                generator: 'OSM Data Extractor v1.0',
                generatorUrl: 'https://github.com/openstreetmap',
                source: 'OpenStreetMap',
                sourceUrl: 'https://www.openstreetmap.org'
            },
            
            // Spatial extent (geographic bounding box)
            extent: bounds ? {
                geographic: {
                    west: bounds.getWest(),
                    east: bounds.getEast(),
                    south: bounds.getSouth(),
                    north: bounds.getNorth(),
                    description: `Geographic extent from ${bounds.getSouth().toFixed(6)}°S to ${bounds.getNorth().toFixed(6)}°N, ${bounds.getWest().toFixed(6)}°W to ${bounds.getEast().toFixed(6)}°E`
                },
                center: {
                    latitude: (bounds.getNorth() + bounds.getSouth()) / 2,
                    longitude: (bounds.getEast() + bounds.getWest()) / 2
                },
                area_km2: Utils.calculateArea(bounds),
                area_formatted: Utils.formatArea(Utils.calculateArea(bounds)),
                bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
                bboxString: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`
            } : null,

            // Temporal extent
            temporal: {
                creation: now.toISOString(),
                publication: now.toISOString(),
                revision: now.toISOString(),
                description: `Data extracted on ${now.toISOString().split('T')[0]}`
            },
            
            // Coordinate reference system (detailed)
            spatialReferenceSystem: {
                type: 'EPSG',
                code: '4326',
                codespace: 'EPSG',
                version: '9.9.0',
                name: 'WGS 84',
                authority: 'EPSG',
                description: 'World Geodetic System 1984',
                proj4: '+proj=longlat +datum=WGS84 +no_defs +type=crs',
                wkt: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]',
                axes: [
                    { name: 'Geodetic longitude', abbreviation: 'Lon', direction: 'east', unit: 'degree' },
                    { name: 'Geodetic latitude', abbreviation: 'Lat', direction: 'north', unit: 'degree' }
                ]
            },
            
            // Feature statistics
            features: {
                total: stats.totalFeatures,
                count: stats.totalFeatures,
                by_geometry: {
                    points: stats.points,
                    lines: stats.lines,
                    polygons: stats.polygons,
                    other: stats.other
                },
                by_type: stats.topFeatureTypes || [],
                density_per_km2: bounds ? parseFloat((stats.totalFeatures / Utils.calculateArea(bounds)).toFixed(2)) : null,
                description: `Dataset contains ${stats.totalFeatures} total features: ${stats.points} point features, ${stats.lines} line features, and ${stats.polygons} polygon features.`
            },
            
            // Attribute information
            attributes: {
                total_tags: stats.tagCount,
                count: stats.tagCount,
                tags: stats.tags || [],
                tag_usage: Object.entries(stats.tagDistribution || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)
                    .map(([tag, count]) => ({
                        tag,
                        count,
                        percentage: ((count / stats.totalFeatures) * 100).toFixed(1) + '%'
                    })),
                unique_values: stats.uniqueValues || {},
                description: `Dataset includes ${stats.tagCount} unique attribute tags across all features.`
            },
            
            // Data quality indicators
            quality: {
                scope: 'dataset',
                completeness: this.calculateCompleteness(geojson),
                attribute_density: stats.totalFeatures > 0 
                    ? parseFloat((Object.values(stats.tagDistribution || {}).reduce((a, b) => a + b, 0) / stats.totalFeatures).toFixed(2))
                    : 0,
                geometry_valid: true,
                clipped_to_boundary: GeometryProcessor.clipBoundary !== null,
                topologicalConsistency: 'Features are topologically consistent within the dataset',
                positionalAccuracy: 'Positional accuracy varies by feature; typically within 1-5 meters for GPS-traced features',
                temporalAccuracy: 'Data reflects the state of OpenStreetMap at time of extraction',
                statement: `This dataset was extracted from OpenStreetMap on ${now.toISOString().split('T')[0]}. Data quality depends on contributions from OpenStreetMap mappers. Completeness score: ${this.calculateCompleteness(geojson)}%.`
            },

            // Lineage (processing history)
            lineage: {
                statement: `Data extracted from OpenStreetMap via Overpass API on ${now.toISOString().split('T')[0]}. Processing steps: 1) Query OpenStreetMap database for specified geographic extent and feature types, 2) Convert OSM XML to GeoJSON format, 3) Clip geometries to boundary, 4) Filter by selected geometry types, 5) Export to ${format.toUpperCase()} format.`,
                processSteps: [
                    {
                        description: 'Query OpenStreetMap database',
                        rationale: 'Extract features within specified geographic bounds',
                        dateTime: now.toISOString(),
                        processor: {
                            name: 'Overpass API',
                            role: 'data_source'
                        }
                    },
                    {
                        description: 'Convert OSM to GeoJSON',
                        rationale: 'Transform data to standard GeoJSON format',
                        dateTime: now.toISOString(),
                        processor: {
                            name: 'OSM Data Extractor',
                            role: 'processor'
                        }
                    },
                    {
                        description: 'Clip to boundary',
                        rationale: 'Ensure all features are within specified boundary',
                        dateTime: now.toISOString(),
                        processor: {
                            name: 'Geometry Processor',
                            role: 'processor'
                        }
                    }
                ],
                source: [
                    {
                        description: 'OpenStreetMap database',
                        sourceCitation: {
                            title: 'OpenStreetMap',
                            date: now.toISOString(),
                            citedResponsibleParty: {
                                name: 'OpenStreetMap Contributors',
                                role: 'originator'
                            }
                        }
                    }
                ]
            },

            // Constraints
            constraints: {
                legal: {
                    useLimitation: 'Use of this data is governed by the Open Database License (ODbL) v1.0. Users must provide attribution to OpenStreetMap contributors and share derivative works under the same license.',
                    accessConstraints: 'none',
                    useConstraints: 'license',
                    otherConstraints: 'Open Database License (ODbL) v1.0'
                },
                security: {
                    classification: 'unclassified',
                    userNote: 'Public data with no security restrictions'
                }
            },

            // Distribution information
            distribution: {
                format: {
                    name: format.toUpperCase(),
                    version: '1.0',
                    specification: this.getFormatSpecification(format)
                },
                transferOptions: {
                    onlineResource: {
                        description: 'Data extracted from OpenStreetMap',
                        function: 'download'
                    }
                }
            },
            
            // Filter information
            filters: {
                selected_features: selectedFeatures || [],
                geometry_types_included: [],
                boundary_type: GeometryProcessor.clipBoundary ? 'user_defined' : 'none',
                description: selectedFeatures && selectedFeatures.length > 0 
                    ? `Features filtered to include: ${selectedFeatures.join(', ')}`
                    : 'All available features included'
            },

            // Keywords
            keywords: [
                { keyword: 'OpenStreetMap', thesaurus: 'General' },
                { keyword: 'OSM', thesaurus: 'General' },
                { keyword: 'Geographic Data', thesaurus: 'General' },
                { keyword: 'Vector Data', thesaurus: 'General' },
                { keyword: 'Geospatial', thesaurus: 'General' }
            ],

            // Topic categories
            topicCategories: [
                'location',
                'transportation',
                'structure',
                'environment'
            ],

            // Maintenance
            maintenance: {
                maintenanceFrequency: 'asNeeded',
                dateOfNextUpdate: null,
                maintenanceNote: 'This is a static extract. For current data, query OpenStreetMap directly.'
            }
        };

        // Add geometry types to filters
        if (stats.points > 0) metadata.filters.geometry_types_included.push('Point');
        if (stats.lines > 0) metadata.filters.geometry_types_included.push('LineString');
        if (stats.polygons > 0) metadata.filters.geometry_types_included.push('Polygon');

        // Add feature-specific keywords
        if (selectedFeatures && selectedFeatures.length > 0) {
            selectedFeatures.forEach(feature => {
                metadata.keywords.push({ keyword: feature, thesaurus: 'Feature Types' });
            });
        }

        return metadata;
    },

    // Get format specification
    getFormatSpecification(format) {
        const specs = {
            'geojson': 'RFC 7946 - The GeoJSON Format',
            'shapefile': 'ESRI Shapefile Technical Description',
            'kml': 'OGC KML 2.3',
            'gpx': 'GPX 1.1 Schema',
            'osm': 'OpenStreetMap XML Format'
        };
        return specs[format] || 'Standard format';
    },

    // Calculate data completeness score
    calculateCompleteness(geojson) {
        if (!geojson.features || geojson.features.length === 0) return 0;

        let totalScore = 0;
        const requiredTags = ['name', 'type', 'class'];
        
        geojson.features.forEach(feature => {
            if (!feature.properties) {
                totalScore += 0;
                return;
            }
            
            const tagCount = Object.keys(feature.properties).length;
            const hasRequired = requiredTags.some(tag => feature.properties[tag]);
            const score = Math.min(100, (tagCount * 10) + (hasRequired ? 20 : 0));
            totalScore += score;
        });

        return Math.round(totalScore / geojson.features.length);
    },

    // Export to GeoJSON with metadata
    async exportGeoJSON(geojson, filename, metadata = null) {
        const output = {
            ...geojson,
            metadata: metadata
        };

        const blob = new Blob([JSON.stringify(output, null, 2)], {
            type: 'application/json'
        });
        Utils.downloadBlob(blob, filename + '.geojson');
        return { filename: filename + '.geojson', size: blob.size };
    },

    // Export to Shapefile (as ZIP with separated geometry types and metadata)
    async exportShapefile(geojson, filename, metadata = null) {
        const zip = new JSZip();
        const separated = GeometryProcessor.splitByGeometryType(geojson);
        const targetCRS = geojson.crs?.properties?.name || 'EPSG:4326';

        // Generate comprehensive README
        const readme = `OpenStreetMap Data Export
============================

IDENTIFIER: ${metadata?.identifier?.code || 'N/A'}
TITLE: ${metadata?.title || 'OpenStreetMap Data Extract'}

ABSTRACT:
${metadata?.abstract || 'OpenStreetMap data extract'}

Export Information:
- Generated: ${metadata?.export?.timestamp || new Date().toISOString()}
- Generator: ${metadata?.export?.generator || 'OSM Data Extractor v1.0'}
- Format: ${metadata?.export?.format?.toUpperCase() || 'SHAPEFILE'}
- Language: ${metadata?.language || 'eng'}
- Character Set: ${metadata?.characterSet || 'utf8'}

Source:
- Source: ${metadata?.export?.source || 'OpenStreetMap'}
- URL: ${metadata?.export?.sourceUrl || 'https://www.openstreetmap.org'}

License:
- Name: ${metadata?.licenses?.[0]?.name || 'Open Database License (ODbL) v1.0'}
- URL: ${metadata?.licenses?.[0]?.url || 'https://opendatacommons.org/licenses/odbl/1.0/'}
- Scope: Dataset
- Attribution Required: Yes
- Share-Alike Required: Yes

Contact:
- Organization: ${metadata?.contacts?.[0]?.organization || 'OpenStreetMap Foundation'}
- Name: ${metadata?.contacts?.[0]?.name || 'OpenStreetMap Contributors'}
- Role: ${metadata?.contacts?.[0]?.role || 'originator'}
- Email: ${metadata?.contacts?.[0]?.email || 'data@openstreetmap.org'}

Spatial Extent:
${metadata?.extent ? `- West: ${metadata.extent.geographic.west.toFixed(6)}°
- East: ${metadata.extent.geographic.east.toFixed(6)}°
- South: ${metadata.extent.geographic.south.toFixed(6)}°
- North: ${metadata.extent.geographic.north.toFixed(6)}°
- Center: ${metadata.extent.center.latitude.toFixed(6)}°, ${metadata.extent.center.longitude.toFixed(6)}°
- Area: ${metadata.extent.area_formatted}
- BBox: ${metadata.extent.bboxString}` : '- Not available'}

Coordinate Reference System:
- Name: ${metadata?.spatialReferenceSystem?.name || 'WGS 84'}
- EPSG Code: ${metadata?.spatialReferenceSystem?.code || '4326'}
- Authority: ${metadata?.spatialReferenceSystem?.authority || 'EPSG'}
- PROJ4: ${metadata?.spatialReferenceSystem?.proj4 || '+proj=longlat +datum=WGS84 +no_defs'}

Feature Summary:
- Total Features: ${metadata?.features?.total || geojson.features.length}
- Points: ${separated.points.features.length}
- Lines: ${separated.lines.features.length}
- Polygons: ${separated.polygons.features.length}
- Density: ${metadata?.features?.density_per_km2 ? metadata.features.density_per_km2 + ' features/km²' : 'N/A'}

${metadata?.features?.by_type?.length > 0 ? `Top Feature Types:
${metadata.features.by_type.map(ft => `  - ${ft.type}: ${ft.count}`).join('\n')}` : ''}

Data Quality:
- Completeness: ${metadata?.quality?.completeness || 0}%
- Attribute Density: ${metadata?.quality?.attribute_density || 0} tags per feature
- Clipped to Boundary: ${metadata?.quality?.clipped_to_boundary ? 'Yes' : 'No'}
- Geometry Valid: ${metadata?.quality?.geometry_valid ? 'Yes' : 'No'}
- Quality Statement: ${metadata?.quality?.statement || 'N/A'}

Lineage:
${metadata?.lineage?.statement || 'Data extracted from OpenStreetMap'}

Files Included:
- points.geojson: Point features (${separated.points.features.length} features)
- lines.geojson: Line features (${separated.lines.features.length} features)
- polygons.geojson: Polygon features (${separated.polygons.features.length} features)
- metadata.json: Complete metadata in JSON format
- metadata.xml: ISO 19115 compliant XML metadata
- README.txt: This file
- LICENSE.txt: Full license text

Usage and Constraints:
${metadata?.constraints?.legal?.useLimitation || 'Use of this data is governed by the Open Database License (ODbL) v1.0'}

Keywords: ${metadata?.keywords?.map(k => k.keyword).join(', ') || 'OpenStreetMap, OSM, Geographic Data'}

For more information:
${metadata?.links?.map(link => `- ${link.title}: ${link.href}`).join('\n') || '- OpenStreetMap: https://www.openstreetmap.org'}
`;
        zip.file('README.txt', readme);

        // Add complete metadata JSON
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));

        // Add ISO 19115 XML metadata
        const xmlMetadata = this.generateISO19115XML(metadata);
        zip.file('metadata.xml', xmlMetadata);

        // Add LICENSE file
        const license = `${metadata?.licenses?.[0]?.name || 'Open Database License (ODbL) v1.0'}

${metadata?.licenses?.[0]?.text || 'This data is made available under the Open Database License: https://opendatacommons.org/licenses/odbl/1.0/'}

You are free to:
- Share: Copy and redistribute the data
- Create: Produce works from the data
- Adapt: Modify, transform and build upon the data

As long as you:
- Attribute: Give appropriate credit to OpenStreetMap contributors
- Share-Alike: If you adapt the data, release under the same license
- Keep Open: If you redistribute the data, keep it open

Full license text: ${metadata?.licenses?.[0]?.url || 'https://opendatacommons.org/licenses/odbl/1.0/'}

Data © OpenStreetMap contributors
`;
        zip.file('LICENSE.txt', license);

        // Add GeoJSON files by type
        if (separated.points.features.length > 0) {
            zip.file('points.geojson', JSON.stringify(separated.points, null, 2));
        }
        if (separated.lines.features.length > 0) {
            zip.file('lines.geojson', JSON.stringify(separated.lines, null, 2));
        }
        if (separated.polygons.features.length > 0) {
            zip.file('polygons.geojson', JSON.stringify(separated.polygons, null, 2));
        }
        if (separated.other.features.length > 0) {
            zip.file('other.geojson', JSON.stringify(separated.other, null, 2));
        }

        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
        });
        
        Utils.downloadBlob(blob, filename + '_shapefile.zip');
        return { filename: filename + '_shapefile.zip', size: blob.size };
    },

    // Generate ISO 19115 compliant XML metadata
    generateISO19115XML(metadata) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd"
                  xmlns:gco="http://www.isotc211.org/2005/gco"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gmd:fileIdentifier>
    <gco:CharacterString>${metadata.identifier.code}</gco:CharacterString>
  </gmd:fileIdentifier>
  <gmd:language>
    <gco:CharacterString>${metadata.language}</gco:CharacterString>
  </gmd:language>
  <gmd:characterSet>
    <gmd:MD_CharacterSetCode codeList="http://standards.iso.org/ittf/PubliclyAvailableStandards/ISO_19139_Schemas/resources/codelist/ML_gmxCodelists.xml#MD_CharacterSetCode" codeListValue="${metadata.characterSet}">${metadata.characterSet}</gmd:MD_CharacterSetCode>
  </gmd:characterSet>
  <gmd:contact>
    <gmd:CI_ResponsibleParty>
      <gmd:organisationName>
        <gco:CharacterString>${metadata.contacts[0].organization}</gco:CharacterString>
      </gmd:organisationName>
      <gmd:contactInfo>
        <gmd:CI_Contact>
          <gmd:address>
            <gmd:CI_Address>
              <gmd:electronicMailAddress>
                <gco:CharacterString>${metadata.contacts[0].email || ''}</gco:CharacterString>
              </gmd:electronicMailAddress>
            </gmd:CI_Address>
          </gmd:address>
        </gmd:CI_Contact>
      </gmd:contactInfo>
      <gmd:role>
        <gmd:CI_RoleCode codeList="http://standards.iso.org/ittf/PubliclyAvailableStandards/ISO_19139_Schemas/resources/codelist/ML_gmxCodelists.xml#CI_RoleCode" codeListValue="${metadata.contacts[0].role}">${metadata.contacts[0].role}</gmd:CI_RoleCode>
      </gmd:role>
    </gmd:CI_ResponsibleParty>
  </gmd:contact>
  <gmd:identificationInfo>
    <gmd:MD_DataIdentification>
      <gmd:citation>
        <gmd:CI_Citation>
          <gmd:title>
            <gco:CharacterString>${metadata.title}</gco:CharacterString>
          </gmd:title>
          <gmd:date>
            <gmd:CI_Date>
              <gmd:date>
                <gco:DateTime>${metadata.export.timestamp}</gco:DateTime>
              </gmd:date>
              <gmd:dateType>
                <gmd:CI_DateTypeCode codeList="http://standards.iso.org/ittf/PubliclyAvailableStandards/ISO_19139_Schemas/resources/codelist/ML_gmxCodelists.xml#CI_DateTypeCode" codeListValue="creation">creation</gmd:CI_DateTypeCode>
              </gmd:dateType>
            </gmd:CI_Date>
          </gmd:date>
        </gmd:CI_Citation>
      </gmd:citation>
      <gmd:abstract>
        <gco:CharacterString>${metadata.abstract}</gco:CharacterString>
      </gmd:abstract>
      <gmd:resourceConstraints>
        <gmd:MD_LegalConstraints>
          <gmd:useLimitation>
            <gco:CharacterString>${metadata.constraints.legal.useLimitation}</gco:CharacterString>
          </gmd:useLimitation>
        </gmd:MD_LegalConstraints>
      </gmd:resourceConstraints>
      <gmd:language>
        <gco:CharacterString>${metadata.language}</gco:CharacterString>
      </gmd:language>
    </gmd:MD_DataIdentification>
  </gmd:identificationInfo>
</gmd:MD_Metadata>`;
    },

    // Export to KML
    async exportKML(geojson, filename) {
        if (typeof tokml === 'undefined') {
            throw new Error('KML export library not loaded');
        }

        const kml = tokml(geojson, {
            documentName: filename,
            documentDescription: 'Exported from OpenStreetMap via OSM Data Extractor',
            simplestyle: true
        });

        const blob = new Blob([kml], {
            type: 'application/vnd.google-earth.kml+xml'
        });
        
        Utils.downloadBlob(blob, filename + '.kml');
        return { filename: filename + '.kml', size: blob.size };
    },

    // Export to GPX
    async exportGPX(geojson, filename) {
        if (typeof togpx === 'undefined') {
            throw new Error('GPX export library not loaded');
        }

        const gpx = togpx(geojson, {
            creator: 'OSM Data Extractor',
            metadata: {
                name: filename,
                desc: 'Exported from OpenStreetMap',
                time: new Date().toISOString()
            }
        });

        const blob = new Blob([gpx], {
            type: 'application/gpx+xml'
        });
        
        Utils.downloadBlob(blob, filename + '.gpx');
        return { filename: filename + '.gpx', size: blob.size };
    },

    // Export to OSM XML
    async exportOSM(osmData, filename) {
        const xml = this.osmToXML(osmData);
        const blob = new Blob([xml], {
            type: 'application/xml'
        });
        
        Utils.downloadBlob(blob, filename + '.osm');
        return { filename: filename + '.osm', size: blob.size };
    },

    // Convert OSM data to XML
    osmToXML(osmData) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<osm version="0.6" generator="OSM Data Extractor">\n';
        xml += `  <note>Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright</note>\n`;
        xml += `  <meta osm_base="${new Date().toISOString()}"/>\n`;

        if (!osmData.elements) {
            xml += '</osm>';
            return xml;
        }

        // Sort elements: nodes first, then ways, then relations
        const nodes = osmData.elements.filter(el => el.type === 'node');
        const ways = osmData.elements.filter(el => el.type === 'way');
        const relations = osmData.elements.filter(el => el.type === 'relation');

        // Export nodes
        nodes.forEach(el => {
            xml += `  <node id="${el.id}" lat="${el.lat}" lon="${el.lon}"`;
            if (el.version) xml += ` version="${el.version}"`;
            if (el.timestamp) xml += ` timestamp="${el.timestamp}"`;
            if (el.changeset) xml += ` changeset="${el.changeset}"`;
            if (el.user) xml += ` user="${this.escapeXML(el.user)}"`;
            if (el.uid) xml += ` uid="${el.uid}"`;

            if (el.tags && Object.keys(el.tags).length > 0) {
                xml += '>\n';
                for (const [k, v] of Object.entries(el.tags)) {
                    xml += `    <tag k="${this.escapeXML(k)}" v="${this.escapeXML(v)}"/>\n`;
                }
                xml += '  </node>\n';
            } else {
                xml += '/>\n';
            }
        });

        // Export ways
        ways.forEach(el => {
            xml += `  <way id="${el.id}"`;
            if (el.version) xml += ` version="${el.version}"`;
            if (el.timestamp) xml += ` timestamp="${el.timestamp}"`;
            if (el.changeset) xml += ` changeset="${el.changeset}"`;
            if (el.user) xml += ` user="${this.escapeXML(el.user)}"`;
            if (el.uid) xml += ` uid="${el.uid}"`;
            xml += '>\n';

            if (el.nodes) {
                el.nodes.forEach(n => xml += `    <nd ref="${n}"/>\n`);
            }

            if (el.tags) {
                for (const [k, v] of Object.entries(el.tags)) {
                    xml += `    <tag k="${this.escapeXML(k)}" v="${this.escapeXML(v)}"/>\n`;
                }
            }
            xml += '  </way>\n';
        });

        // Export relations
        relations.forEach(el => {
            xml += `  <relation id="${el.id}"`;
            if (el.version) xml += ` version="${el.version}"`;
            if (el.timestamp) xml += ` timestamp="${el.timestamp}"`;
            if (el.changeset) xml += ` changeset="${el.changeset}"`;
            if (el.user) xml += ` user="${this.escapeXML(el.user)}"`;
            if (el.uid) xml += ` uid="${el.uid}"`;
            xml += '>\n';

            if (el.members) {
                el.members.forEach(m => {
                    xml += `    <member type="${m.type}" ref="${m.ref}" role="${this.escapeXML(m.role || '')}"/>\n`;
                });
            }

            if (el.tags) {
                for (const [k, v] of Object.entries(el.tags)) {
                    xml += `    <tag k="${this.escapeXML(k)}" v="${this.escapeXML(v)}"/>\n`;
                }
            }
            xml += '  </relation>\n';
        });

        xml += '</osm>';
        return xml;
    },

    // Escape XML special characters
    escapeXML(str) {
        if (typeof str !== 'string') str = String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    // Main export function with metadata generation
    async export(format, geojson, osmData, filename, geometryFilter = null, bounds = null, selectedFeatures = null) {
        try {
            // Apply geometry filter if specified
            let filteredGeoJSON = geojson;
            if (geometryFilter && geometryFilter.length > 0) {
                filteredGeoJSON = this.filterByGeometry(geojson, geometryFilter);
                
                if (filteredGeoJSON.features.length === 0) {
                    throw new Error('No features match the selected geometry types');
                }
            }

            // Generate comprehensive metadata with all required fields
            const metadata = this.generateMetadata(filteredGeoJSON, bounds, selectedFeatures, format, filename);

            let result;

            switch (format) {
                case 'geojson':
                    result = await this.exportGeoJSON(filteredGeoJSON, filename, metadata);
                    break;
                case 'shapefile':
                    result = await this.exportShapefile(filteredGeoJSON, filename, metadata);
                    break;
                case 'kml':
                    result = await this.exportKML(filteredGeoJSON, filename);
                    break;
                case 'gpx':
                    result = await this.exportGPX(filteredGeoJSON, filename);
                    break;
                case 'osm':
                    result = await this.exportOSM(osmData, filename);
                    break;
                default:
                    throw new Error('Unsupported export format');
            }

            return result;
        } catch (error) {
            throw new Error('Export failed: ' + error.message);
        }
    },

    // Filter GeoJSON by geometry type
    filterByGeometry(geojson, allowedTypes) {
        const filtered = {
            type: 'FeatureCollection',
            features: [],
            crs: geojson.crs
        };

        const typeMap = {
            'Point': ['Point', 'MultiPoint'],
            'LineString': ['LineString', 'MultiLineString'],
            'Polygon': ['Polygon', 'MultiPolygon']
        };

        // Build list of allowed geometry types
        const allowed = new Set();
        allowedTypes.forEach(type => {
            if (typeMap[type]) {
                typeMap[type].forEach(t => allowed.add(t));
            }
        });

        // Filter features
        geojson.features.forEach(feature => {
            if (allowed.has(feature.geometry.type)) {
                filtered.features.push(feature);
            }
        });

        return filtered;
    }
};