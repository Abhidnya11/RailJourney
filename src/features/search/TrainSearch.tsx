import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Train } from '@shared/domain';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { describeError } from '@/lib/api/errors';
import { useRecentSearches } from '@/features/recent-searches/store';
import { MIN_QUERY_LENGTH, normalizeInput, useTrainSearch } from './useTrainSearch';

export function TrainSearch() {
  const [input, setInput] = useState('');
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const addRecent = useRecentSearches((s) => s.add);
  const listId = useId();
  const narrow = useMediaQuery('(max-width: 639px)');
  const statusId = useId();

  const search = useTrainSearch(input);
  const typed = normalizeInput(input);
  const showList = search.enabled && search.results.length > 0;
  const loading = search.enabled && (search.isFetching || search.pendingDebounce);
  // The first result is the one Enter opens, so it is highlighted until the user moves.
  const highlighted = active >= 0 ? active : 0;

  function select(train: Train) {
    addRecent({ number: train.number, name: train.name, origin: train.origin, destination: train.destination });
    navigate(`/train/${train.number}`);
  }

  function clear() {
    setInput('');
    setActive(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const n = search.results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setActive((a) => (a + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? n - 1 : a - 1));
    } else if (e.key === 'Enter') {
      const pick = search.results[active >= 0 ? active : 0];
      if (pick) {
        e.preventDefault();
        select(pick);
      }
    } else if (e.key === 'Escape') {
      clear();
    }
  }

  return (
    <section className="search" aria-label="Train search">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search by train number or name
      </label>
      <div role="search" className="search__bar">
        <span className="search__lead">
          <Icon name="search" size={24} />
        </span>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          className="search__input type-body-md"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={narrow ? 'Train number or name' : 'Search by train number (e.g. 12951) or train name (Rajdhani, Vande Bharat)...'}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={statusId}
          aria-activedescendant={showList ? `${listId}-opt-${highlighted}` : undefined}
          aria-invalid={search.isError || undefined}
        />
        <div className="search__trail">
          {/* Nearest-station lookup is not wired up yet; drawn as in the design. */}
          <button type="button" className="search__icon-btn" aria-label="Locate nearest station" title="Locate via GPS">
            <Icon name="near_me" size={20} />
          </button>
          {input && (
            <button type="button" className="search__icon-btn search__icon-btn--quiet" aria-label="Clear search" onClick={clear}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      </div>

      <div id={statusId} role="status" aria-live="polite" className="sr-only">
        {!search.enabled
          ? ''
          : loading
            ? 'Searching'
            : `${search.results.length} ${search.results.length === 1 ? 'train' : 'trains'} found`}
      </div>

      {typed.length > 0 && (
        <div className="search__panel">
          <div className="search__panel-head">
            {search.enabled ? (
              <>
                <div className="spread" style={{ gap: 4 }}>
                  <span className="type-label-sm eyebrow text-muted" style={{ fontWeight: 600 }}>
                    Matches for “{typed}”
                  </span>
                  {!loading && !search.isError && (
                    <span className="search__count type-data-md">{search.results.length} Found</span>
                  )}
                </div>
                <span className="search__live type-data-md">
                  <span className="dot" aria-hidden="true" /> Live GPS
                </span>
              </>
            ) : (
              <span className="type-label-sm text-muted">Enter at least {MIN_QUERY_LENGTH} characters.</span>
            )}
          </div>

          {search.isError && !search.isFetching && (
            <div className="search__state">
              <ErrorState {...describeError(search.error)} onRetry={() => void search.refetch()} />
            </div>
          )}
          {search.enabled && loading && search.results.length === 0 && (
            <div className="search__state">
              <Skeleton label="Searching trains" rows={2} />
            </div>
          )}

          <ul id={listId} role="listbox" aria-label="Matching trains" hidden={!showList} className="search__results">
            {search.results.map((t, i) => (
              <li
                key={t.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === highlighted}
                className={`result${i === highlighted ? ' result--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => select(t)}
              >
                <div className="result__icon">
                  <Icon name="directions_railway" size={22} />
                </div>
                <div>
                  <div className="result__head">
                    <span className="result__title type-headline-sm">
                      <span className="tabular">{t.number}</span> — {t.name}
                    </span>
                    {t.type && <span className="result__tag type-label-sm">{t.type}</span>}
                  </div>
                  {t.origin && t.destination && (
                    <div className="result__route type-body-sm">
                      <span>{t.origin}</span>
                      <Icon name="arrow_forward" size={14} />
                      <span>{t.destination}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {search.enabled && !loading && !search.isError && search.results.length === 0 && (
            <div className="search__state">
              <EmptyState title="No matching train found">
                <p>Check the number or try part of the train name.</p>
              </EmptyState>
            </div>
          )}

          {search.enabled && (
            <div className="search__foot type-label-sm">
              <div className="search__hints">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> to navigate
                </span>
                <span>
                  <kbd>↵</kbd> to open telemetry
                </span>
                <span>
                  <kbd>Esc</kbd> to dismiss
                </span>
              </div>
              {/* Advanced station search has no page yet; drawn as in the design. */}
              <a href="#" className="cta-link type-label-sm" onClick={(e) => e.preventDefault()}>
                Advanced Station Search
                <Icon name="arrow_outward" size={14} />
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
