"""
Biomedical API integrations — PubMed, UniProt, ClinicalTrials.gov, NCBI Gene, Europe PMC.
All free APIs, no keys required (NCBI key optional for higher rate limits).
"""

import httpx
from typing import Optional

TIMEOUT = 30


# ========================================
# PubMed / NCBI E-utilities
# ========================================

async def search_pubmed(query: str, max_results: int = 20, ncbi_key: str = ""):
    """Search PubMed for articles. Returns list of article summaries."""
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
    }
    if ncbi_key:
        params["api_key"] = ncbi_key

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Step 1: Search for IDs
        resp = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params=params)
        resp.raise_for_status()
        search_data = resp.json()
        id_list = search_data.get("esearchresult", {}).get("idlist", [])

        if not id_list:
            return {"count": 0, "articles": []}

        # Step 2: Fetch summaries
        summary_params = {
            "db": "pubmed",
            "id": ",".join(id_list),
            "retmode": "json",
        }
        if ncbi_key:
            summary_params["api_key"] = ncbi_key

        resp2 = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", params=summary_params)
        resp2.raise_for_status()
        summary_data = resp2.json()

        articles = []
        result = summary_data.get("result", {})
        for pmid in id_list:
            article = result.get(pmid, {})
            if isinstance(article, dict):
                authors = article.get("authors", [])
                author_names = [a.get("name", "") for a in authors[:3]] if isinstance(authors, list) else []
                articles.append({
                    "pmid": pmid,
                    "title": article.get("title", ""),
                    "authors": author_names,
                    "journal": article.get("fulljournalname", article.get("source", "")),
                    "pubdate": article.get("pubdate", ""),
                    "doi": article.get("elocationid", ""),
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                })

        total = int(search_data.get("esearchresult", {}).get("count", 0))
        return {"count": total, "articles": articles}


# ========================================
# UniProt — Protein database
# ========================================

async def search_uniprot(query: str, max_results: int = 20):
    """Search UniProt for proteins."""
    params = {
        "query": query,
        "format": "json",
        "size": max_results,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get("https://rest.uniprot.org/uniprotkb/search", params=params)
        resp.raise_for_status()
        data = resp.json()

        proteins = []
        for entry in data.get("results", []):
            protein_name = ""
            if entry.get("proteinDescription", {}).get("recommendedName"):
                protein_name = entry["proteinDescription"]["recommendedName"].get("fullName", {}).get("value", "")

            gene_names = []
            for gene in entry.get("genes", []):
                if gene.get("geneName"):
                    gene_names.append(gene["geneName"].get("value", ""))

            organism = entry.get("organism", {}).get("scientificName", "")
            accession = entry.get("primaryAccession", "")

            proteins.append({
                "accession": accession,
                "protein_name": protein_name,
                "gene_names": gene_names,
                "organism": organism,
                "length": entry.get("sequence", {}).get("length", 0),
                "url": f"https://www.uniprot.org/uniprot/{accession}",
            })

        return {"count": len(proteins), "proteins": proteins}


# ========================================
# ClinicalTrials.gov v2 API
# ========================================

async def search_clinical_trials(query: str, max_results: int = 20, status: Optional[str] = None):
    """Search ClinicalTrials.gov for clinical trials."""
    params = {
        "query.term": query,
        "pageSize": max_results,
        "format": "json",
    }
    if status:
        params["filter.overallStatus"] = status

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get("https://clinicaltrials.gov/api/v2/studies", params=params)
        resp.raise_for_status()
        data = resp.json()

        trials = []
        for study in data.get("studies", []):
            proto = study.get("protocolSection", {})
            ident = proto.get("identificationModule", {})
            status_mod = proto.get("statusModule", {})
            design = proto.get("designModule", {})

            nct_id = ident.get("nctId", "")
            trials.append({
                "nct_id": nct_id,
                "title": ident.get("briefTitle", ""),
                "official_title": ident.get("officialTitle", ""),
                "status": status_mod.get("overallStatus", ""),
                "phase": ", ".join(design.get("phases", [])) if design.get("phases") else "",
                "start_date": status_mod.get("startDateStruct", {}).get("date", ""),
                "url": f"https://clinicaltrials.gov/study/{nct_id}",
            })

        total = data.get("totalCount", len(trials))
        return {"count": total, "trials": trials}


# ========================================
# NCBI Gene
# ========================================

async def search_gene(query: str, max_results: int = 20, ncbi_key: str = ""):
    """Search NCBI Gene database."""
    params = {
        "db": "gene",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
    }
    if ncbi_key:
        params["api_key"] = ncbi_key

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params=params)
        resp.raise_for_status()
        search_data = resp.json()
        id_list = search_data.get("esearchresult", {}).get("idlist", [])

        if not id_list:
            return {"count": 0, "genes": []}

        summary_params = {
            "db": "gene",
            "id": ",".join(id_list),
            "retmode": "json",
        }
        if ncbi_key:
            summary_params["api_key"] = ncbi_key

        resp2 = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", params=summary_params)
        resp2.raise_for_status()
        summary_data = resp2.json()

        genes = []
        result = summary_data.get("result", {})
        for gid in id_list:
            gene = result.get(gid, {})
            if isinstance(gene, dict):
                genes.append({
                    "gene_id": gid,
                    "name": gene.get("name", ""),
                    "description": gene.get("description", ""),
                    "organism": gene.get("organism", {}).get("scientificname", "") if isinstance(gene.get("organism"), dict) else "",
                    "chromosome": gene.get("chromosome", ""),
                    "url": f"https://www.ncbi.nlm.nih.gov/gene/{gid}",
                })

        total = int(search_data.get("esearchresult", {}).get("count", 0))
        return {"count": total, "genes": genes}


# ========================================
# Europe PMC — Open access literature
# ========================================

async def search_europe_pmc(query: str, max_results: int = 20):
    """Search Europe PMC for open access publications."""
    params = {
        "query": query,
        "format": "json",
        "pageSize": max_results,
        "resultType": "core",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get("https://www.ebi.ac.uk/europepmc/webservices/rest/search", params=params)
        resp.raise_for_status()
        data = resp.json()

        articles = []
        for result in data.get("resultList", {}).get("result", []):
            articles.append({
                "id": result.get("id", ""),
                "source": result.get("source", ""),
                "title": result.get("title", ""),
                "authors": result.get("authorString", ""),
                "journal": result.get("journalTitle", ""),
                "pubdate": result.get("firstPublicationDate", ""),
                "doi": result.get("doi", ""),
                "is_open_access": result.get("isOpenAccess", "N") == "Y",
                "cited_by_count": result.get("citedByCount", 0),
                "url": f"https://europepmc.org/article/{result.get('source', 'MED')}/{result.get('id', '')}",
            })

        total = data.get("hitCount", len(articles))
        return {"count": total, "articles": articles}
